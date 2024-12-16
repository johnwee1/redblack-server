import GameSession from "../models/GameSession";

/**
 * Service to handle all running game sessions
 */
class GameService {
  /**
  Maps room alias to GameSession object
  */
  gameSessions: Map<string, GameSession>;

  /**
  Maps user's socket.id to room alias
  */
  userSessions: Map<string, string>;

  constructor() {
    this.gameSessions = new Map();
    this.userSessions = new Map();
  }

  createSession(playerName: string, creatorID: string, roomAlias: string) {
    if (this.gameSessions.has(roomAlias)) {
      // handle case where room name is already taken

      return null;
    }
    const gameSession = new GameSession(creatorID, roomAlias);
    gameSession.addPlayer(creatorID, playerName);
    this.gameSessions.set(gameSession.alias, gameSession);
    return gameSession;
  }

  getSession(roomAlias: string) {
    return this.gameSessions.get(roomAlias);
  }

  deleteSession(roomAlias: string) {
    this.gameSessions.delete(roomAlias);
  }

  /**
   * For each game session, if the player is in the session, remove the player.
   * Delete session if no players are left.
   * @param playerID
   */
  handleDisconnect(playerID: string) {
    const roomAlias = this.userSessions.get(playerID);
    if (roomAlias) {
      const gameSession = this.gameSessions.get(roomAlias);
      if (gameSession) {
        gameSession.removePlayer(playerID);
        if (gameSession.players.size === 0) {
          this.deleteSession(roomAlias);
        }
      }
      this.userSessions.delete(playerID); // Clean up user session
    }
  }
}

export default new GameService();
