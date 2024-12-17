// run every 14 minutes
export const keepAlive = () => {
  setInterval(
    async () => {
      const res = await fetch("https://redblack-server.onrender.com");
      console.log(res.status);
    },
    14 * 60 * 1000,
  );
};
