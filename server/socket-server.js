const http = require('http');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

const PORT = process.env.SOCKET_SERVER_PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET;

function isAdminRole(role) {
  return ['super_admin', 'admin', 'qa_manager', 'team_lead'].includes(String(role || '').toLowerCase());
}

function resolveSocketRole(socket, providedRole, token) {
  if (!token) return providedRole || socket.handshake.query.role || 'unknown';
  if (!JWT_SECRET) return providedRole || socket.handshake.query.role || 'unknown';
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return payload.role || providedRole || socket.handshake.query.role || 'unknown';
  } catch (error) {
    console.warn('Socket auth failed:', error.message);
    return null;
  }
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/emit') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const { event, payload, toEmployeeId, toAdmins } = JSON.parse(body || '{}');
        if (event) {
          if (toEmployeeId) {
            io.to(`employee:${toEmployeeId}`).emit(event, payload);
          }
          if (toAdmins) {
            io.to('admins').emit(event, payload);
          }
          if (!toEmployeeId && !toAdmins) {
            io.emit(event, payload);
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: error.message }));
      }
    });
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Socket.IO server is running');
});

const io = new Server(server, {
  cors: {
    origin: process.env.SOCKET_CLIENT_ORIGIN || '*',
    methods: ['GET', 'POST'],
  },
});

const employeeSocketMap = new Map(); // employeeId -> socket.id

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id, socket.handshake.query.role || 'unknown');

  socket.on('register', ({ role, employeeId }) => {
    socket.data.role = role || socket.handshake.query.role || 'unknown';
    socket.data.employeeId = employeeId || socket.handshake.query.employeeId || null;

    if (socket.data.role === 'admin' || socket.data.role === 'team_lead' || socket.data.role === 'super_admin') {
      socket.join('admins');
    }

    if (socket.data.employeeId) {
      // ✅ Agar isi employeeId ka koi PURANA socket zinda hai, use force disconnect karo
      const existingSocketId = employeeSocketMap.get(socket.data.employeeId);
      if (existingSocketId && existingSocketId !== socket.id) {
        const oldSocket = io.sockets.sockets.get(existingSocketId);
        if (oldSocket) {
          console.log(`[dedupe] Disconnecting stale socket ${existingSocketId} for employeeId ${socket.data.employeeId}`);
          oldSocket.disconnect(true);
        }
      }
      employeeSocketMap.set(socket.data.employeeId, socket.id);
      socket.join(`employee:${socket.data.employeeId}`);
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', socket.id, reason);
    // Map se bhi hata do agar ye socket hi current mapped socket tha
    for (const [empId, sockId] of employeeSocketMap.entries()) {
      if (sockId === socket.id) employeeSocketMap.delete(empId);
    }
  });


  socket.on('employee-status', (payload) => {
    const targetEmployeeId = payload?.employeeId || socket.data.employeeId;
    if (targetEmployeeId) {
      io.to(`employee:${targetEmployeeId}`).emit('employee-status', payload);
    }
    io.to('admins').emit('employee-status', payload);
  });

  socket.on('heartbeat', (payload) => {
    io.to('admins').emit('heartbeat', payload);
  });

  socket.on('new-alert', (payload) => {
    const targetEmployeeId = payload?.employee_id || payload?.employeeId || socket.data.employeeId;
    if (targetEmployeeId) {
      io.to(`employee:${targetEmployeeId}`).emit('new-alert', payload);
    }
    io.to('admins').emit('new-alert', payload);
  });

  socket.on('security-event', (payload) => {
    io.to('admins').emit('security-event', payload);
  });

  socket.on('new-screenshot', (payload) => {
    const targetEmployeeId = payload?.employeeId || payload?.userId || socket.data.employeeId;
    if (targetEmployeeId) {
      io.to(`employee:${targetEmployeeId}`).emit('new-screenshot', payload);
    }
    io.to('admins').emit('new-screenshot', payload);
  });

  socket.on('stream-request', ({ employeeId, adminId }) => {
    if (!employeeId) return;
    console.log('[socket-server] stream-request received', { employeeId, adminId: adminId || socket.id });
    io.to(`employee:${employeeId}`).emit('stream-request', { employeeId, adminId: adminId || socket.id });
  });

  socket.on('stream-offer', ({ employeeId, adminId, sdp }) => {
    if (!employeeId || !adminId) return;
    console.log('[socket-server] stream-offer received; forwarding to admin', { employeeId, adminId, hasSdp: Boolean(sdp) });
    io.to(adminId).emit('stream-offer', { employeeId, sdp });
  });

  socket.on('stream-answer', ({ employeeId, adminId, sdp }) => {
    if (!employeeId || !adminId) return;
    console.log('[socket-server] stream-answer received; forwarding to agent', { employeeId, adminId, hasSdp: Boolean(sdp) });
    io.to(`employee:${employeeId}`).emit('stream-answer', { employeeId, adminId, sdp });
  });

  socket.on('ice-candidate', ({ employeeId, adminId, candidate, from }) => {
    if (from === 'admin' && employeeId) {
      console.log('[socket-server] ICE candidate received from admin; forwarding to agent', { employeeId, candidateType: candidate?.candidate?.slice(0, 12) });
      io.to(`employee:${employeeId}`).emit('ice-candidate', { employeeId, adminId: socket.id, candidate, from: 'admin' });
    } else if (from === 'agent' && adminId) {
      console.log('[socket-server] ICE candidate received from agent; forwarding to admin', { employeeId, adminId, candidateType: candidate?.candidate?.slice(0, 12) });
      io.to(adminId).emit('ice-candidate', { employeeId, candidate, from: 'agent' });
    }
  });

  socket.on('stop-stream', ({ employeeId, adminId }) => {
    if (!employeeId) return;
    io.to(`employee:${employeeId}`).emit('stop-stream', { employeeId, adminId: adminId || socket.id });
    if (adminId) {
      io.to(adminId).emit('stop-stream', { employeeId });
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', socket.id, reason);
  });
});

server.listen(PORT, () => {
  console.log(`Socket.IO server listening on port ${PORT}`);
});