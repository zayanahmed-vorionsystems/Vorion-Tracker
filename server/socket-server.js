const http = require('http');
const { Server } = require('socket.io');

const PORT = process.env.SOCKET_SERVER_PORT || 4000;

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

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id, socket.handshake.query.role || 'unknown');

  socket.on('register', ({ role, employeeId }) => {
    socket.data.role = role || socket.handshake.query.role || 'unknown';
    socket.data.employeeId = employeeId || socket.handshake.query.employeeId || null;

    if (socket.data.role === 'admin' || socket.data.role === 'team_lead' || socket.data.role === 'super_admin') {
      socket.join('admins');
    }

    if (socket.data.employeeId) {
      socket.join(`employee:${socket.data.employeeId}`);
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

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', socket.id, reason);
  });
});

server.listen(PORT, () => {
  console.log(`Socket.IO server listening on port ${PORT}`);
});
