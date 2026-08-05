let socketServer = null;

export const setIo = (io) => {
  socketServer = io;
};

export const getIo = () => socketServer;
