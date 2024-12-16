import gameService from "../services/GameService";
import GameSession from "../models/GameSession";
import { Server, Socket } from "socket.io";
const TIMEOUT_MS = 600_000;

const publicSessionInfo = (gameSession: GameSession) => {
  return {
    alias: gameSession.alias,
    state: gameSession.state,
    players: [...gameSession.players.entries()],
    creatorID: gameSession.creatorID,
    question: gameSession.question,
  };
};

const leavePreviousSession = (socket: Socket) => {
  // Check if the user is in a session
  const oldRoomAlias = gameService.userSessions.get(socket.id);
  if (!oldRoomAlias) return; // User is not in a session

  // Get the session the user is currently in
  const oldGameSession = gameService.getSession(oldRoomAlias);

  if (!oldGameSession) {
    gameService.userSessions.delete(socket.id);
    console.log("weird error, session not found.");
    socket.emit("debug", "weird error, session not found.");
    return;
  }

  // If the creator leaves the session the reset room for everyone.
  if (oldGameSession?.creatorID === socket.id) {
    for (const [id, player] of oldGameSession.players) {
      gameService.userSessions.delete(id);
    }
    socket.in(oldRoomAlias).emit("leaveSessionOnClientSide");
    socket.in(oldRoomAlias).socketsLeave(oldRoomAlias);
    gameService.deleteSession(oldRoomAlias);
    return;
  }

  // Remove the user from the session
  oldGameSession.removePlayer(socket.id);

  // If the session is empty after the user leaves, delete it
  if (oldGameSession.players.size === 0) {
    gameService.deleteSession(oldRoomAlias);
  }

  // broadcast new session info to all players in the room before leaving socket room
  socket
    .in(oldRoomAlias)
    .emit("sessionInfo", publicSessionInfo(oldGameSession));
  socket.leave(oldRoomAlias);

  gameService.userSessions.delete(socket.id);

  socket.emit("leaveSessionOnClientSide");
};

const validateSession = (socket: Socket) => {
  const roomAlias = gameService.userSessions.get(socket.id);
  if (!roomAlias) {
    socket.emit("message", "You are not in a game session");
    return null;
  }

  const gameSession = gameService.getSession(roomAlias);
  if (!gameSession) {
    socket.emit("message", "Game session not found");
    return null;
  }

  return { gameSession, roomAlias };
};

const initializeSocket = (io: Server) => {
  io.on("connection", (socket) => {
    console.log("New connection: " + socket.id);

    socket.on("createSession", (playerName: string, roomAlias: string) => {
      leavePreviousSession(socket);

      const gameSession = gameService.createSession(
        playerName,
        socket.id,
        roomAlias,
      );

      if (gameSession === null) {
        socket.emit("message", "Room already exists");
        return;
      }

      gameService.userSessions.set(socket.id, roomAlias);
      socket.join(roomAlias);
      socket.emit("sessionInfo", publicSessionInfo(gameSession));
    });

    socket.on("joinSession", (playerName: string, roomAlias: string) => {
      leavePreviousSession(socket);

      const gameSession = gameService.getSession(roomAlias);
      if (!gameSession) {
        socket.emit("message", "Room does not exist");
        return;
      }
      if (
        Array.from(gameSession.players).find(
          ([id, player]) => player.name === playerName,
        )
      ) {
        socket.emit("message", "Player nickname already exists in this room!");
        return;
      }
      if (gameSession && gameSession.state === "wait") {
        gameSession.addPlayer(socket.id, playerName);
        gameService.userSessions.set(socket.id, roomAlias);
        socket.join(roomAlias);
        io.to(roomAlias).emit("sessionInfo", publicSessionInfo(gameSession));
      } else {
        socket.emit("message", "Game already started");
        // TODO: Add queue for future handling, joining mid-game
      }
    });

    socket.on("leaveSession", () => {
      leavePreviousSession(socket);
      socket.emit("leaveSessionOnClientSide");
    });

    socket.on("disconnect", () => {
      gameService.handleDisconnect(socket.id);
    });

    socket.on("startGame", () => {
      const session = validateSession(socket);
      if (!session) return;
      const { gameSession, roomAlias } = session;

      if (gameSession.creatorID !== socket.id) {
        socket.emit("message", "Only creator can start game");
        return;
      }
      gameSession.state = "questions";
      io.to(roomAlias).emit("sessionInfo", publicSessionInfo(gameSession));
    });

    socket.on("submitQuestion", (question) => {
      const session = validateSession(socket);
      if (!session) return;
      const { gameSession, roomAlias } = session;
      if (gameSession.submitQuestion(socket.id, question)) {
        socket.emit("message", "Question submitted");
      } else {
        socket.emit(
          "message",
          "Cannot submit question - not in question phase or not creator",
        );
      }
      gameSession.state = "answer";
      io.to(roomAlias).emit("sessionInfo", publicSessionInfo(gameSession));

      // start server-side timer for the answer phase
      setTimeout(() => {
        if (gameSession.state === "answer") {
          gameSession.state = "guess";
          io.to(roomAlias).emit("sessionInfo", publicSessionInfo(gameSession));
        }
      }, TIMEOUT_MS);
    });

    socket.on("submitAnswer", (answer) => {
      const session = validateSession(socket);
      if (!session) return;
      const { gameSession, roomAlias } = session;
      if (gameSession.submitAnswer(socket.id, answer)) {
        gameSession.state = "guess";
        io.to(roomAlias).emit("sessionInfo", publicSessionInfo(gameSession));

        // start server-side timer for the guessing phase too
        setTimeout(() => {
          if (gameSession.state === "guess") {
            // if still somehow guessing
            gameSession.state = "reveal";
            io.to(roomAlias).emit(
              "sessionInfo",
              publicSessionInfo(gameSession),
            );
            io.to(roomAlias).emit("revealInfo", {
              numberOfReds: gameSession.numberOfReds,
              guesses: [...gameSession.getAllGuesses().entries()],
            });
          }
        }, TIMEOUT_MS); // 30 seconds
      }
    });

    socket.on("submitGuess", (guess: number) => {
      const session = validateSession(socket);
      if (!session) return;
      const { gameSession, roomAlias } = session;
      if (gameSession.submitGuess(socket.id, guess)) {
        gameSession.state = "reveal";
        io.to(roomAlias).emit("sessionInfo", publicSessionInfo(gameSession));
        io.to(roomAlias).emit("revealInfo", {
          numberOfReds: gameSession.numberOfReds,
          guesses: [...gameSession.getAllGuesses().entries()],
        });
        console.log(gameSession);
      }
    });

    socket.on("getPlayerGuess", (nameOfPlayerToGuess: string) => {
      const session = validateSession(socket);
      if (!session) return;
      const { gameSession, roomAlias } = session;
      const playerID = Array.from(gameSession.players).find(
        ([id, player]) => player.name === nameOfPlayerToGuess,
      );
      if (!playerID) {
        socket.emit("message", "Player not found");
        return;
      }
      const answer = gameSession.getPlayerAnswer(
        socket.id,
        nameOfPlayerToGuess,
      );
      if (!answer) {
        socket.emit("message", "Answer not found");
        return;
      }
      io.to(roomAlias).emit("playerAnswer", {
        name: nameOfPlayerToGuess,
        answer: answer,
      });

      if (gameSession.consumedCheck.size === gameSession.numberOfReds) {
        // automatically reset and start new round after a set time
        setTimeout(() => {
          if (gameSession.state !== "reveal") return;
          gameSession.reset();
          io.to(roomAlias).emit("sessionInfo", publicSessionInfo(gameSession));
        }, 10_000);
      }
      return;
    });

    socket.on("resetRound", () => {
      const session = validateSession(socket);
      if (!session) return;
      const { gameSession, roomAlias } = session;
      gameSession.reset();
      io.to(roomAlias).emit("sessionInfo", publicSessionInfo(gameSession));
    });

    socket.on("getGameService", () => {
      console.log(gameService);
      socket.emit("debug", gameService);
    });
  });
};

export default initializeSocket;
