const { Server } = require('socket.io');

function initSocket(server, sessionMiddleware, db) {
  const io = new Server(server);

  io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
  });

  const boardPresence = {};
  const boardTimers = {};

  function getPresenceList(boardId) {
    const users = boardPresence[boardId] || {};
    const names = [];
    let anonCount = 0;

    for (const info of Object.values(users)) {
      if (info.display_name === 'Anonymous') {
        anonCount++;
      } else {
        names.push(info.display_name);
      }
    }

    return { names: [...new Set(names)], anonCount };
  }

  io.on('connection', (socket) => {
    socket.on('join-board', ({ boardId, sessionId, display_name }) => {
      socket.join(boardId);
      socket.boardId = boardId;
      socket.sessionId = sessionId;
      socket.display_name = display_name;

      if (!boardPresence[boardId]) {
        boardPresence[boardId] = {};
      }
      boardPresence[boardId][socket.id] = { display_name, sessionId };

      io.to(boardId).emit('presence:updated', getPresenceList(boardId));

      // If there's an active timer for this board, send it to the joining socket
      if (boardTimers[boardId] && boardTimers[boardId].endTime > Date.now()) {
        socket.emit('timer:started', { endTime: boardTimers[boardId].endTime });
      }
    });

    socket.on('card:add', (data) => {
      io.to(socket.boardId).emit('card:added', data);
    });

    socket.on('card:edit', (data) => {
      io.to(socket.boardId).emit('card:edited', data);
    });

    socket.on('card:delete', (data) => {
      io.to(socket.boardId).emit('card:deleted', data);
    });

    socket.on('card:react', (data) => {
      io.to(socket.boardId).emit('card:reacted', data);
    });

    socket.on('board:lock', (data) => {
      io.to(socket.boardId).emit('board:locked', data);
    });

    socket.on('timer:start', ({ boardId, endTime }) => {
      const id = boardId || socket.boardId;
      boardTimers[id] = { endTime };
      io.to(id).emit('timer:started', { endTime });
    });

    socket.on('timer:cancel', ({ boardId } = {}) => {
      const id = boardId || socket.boardId;
      delete boardTimers[id];
      io.to(id).emit('timer:cancelled');
    });

    let disconnectTimer;
    socket.on('disconnect', () => {
      const boardId = socket.boardId;
      if (!boardId) return;

      disconnectTimer = setTimeout(() => {
        if (boardPresence[boardId]) {
          delete boardPresence[boardId][socket.id];
          if (Object.keys(boardPresence[boardId]).length === 0) {
            delete boardPresence[boardId];
          }
        }
        io.to(boardId).emit('presence:updated', getPresenceList(boardId));
      }, 5000);
    });
  });

  return io;
}

module.exports = { initSocket };
