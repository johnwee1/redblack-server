type Player = {
  id: string;
  name: string;
};

type GameState = "wait" | "questions" | "answer" | "guess" | "reveal";
type Answer = "red" | "black";

class GameSession {
  public alias: string;
  public creatorID: string;
  public players: Map<string, Player>;
  public state: GameState;
  public question: string;
  private answers: Map<string, Answer>;
  public numberOfReds: number;
  private guesses: Map<string, number>;
  public consumedCheck: Set<string>; // set of player IDs who have already used their privilege to reveal
  // private timeLimit: number;

  constructor(creatorID: string, roomAlias: string) {
    this.alias = roomAlias;
    this.creatorID = creatorID;
    this.players = new Map<string, Player>();
    this.state = "wait";
    this.answers = new Map<string, Answer>();
    this.numberOfReds = 0;
    this.guesses = new Map<string, number>();
    this.question = "";
    this.consumedCheck = new Set();
    // this.timeLimit = 30000;
  }

  public reset(): void {
    this.state = "wait";
    this.answers.clear();
    this.numberOfReds = 0;
    this.guesses.clear();
    this.question = "";
    this.consumedCheck = new Set();
  }

  public addPlayer(playerID: string, playerName: string): void {
    console.log("Add player to gamesession!");
    this.players.set(playerID, {
      id: playerID,
      name: playerName,
    });
  }

  public removePlayer(playerID: string): void {
    this.players.delete(playerID);
  }

  public submitQuestion(playerID: string, question: string) {
    if (this.state !== "questions") return false;
    if (playerID !== this.creatorID) return false; // only creator can submit question
    this.question = question;
    return true;
  }

  public submitAnswer(playerID: string, answer: Answer): boolean {
    if (this.state !== "answer") return false;
    this.answers.set(playerID, answer);
    if (answer === "red") {
      this.numberOfReds++;
    }
    return this.answers.size === this.players.size;
  }

  public submitGuess(playerID: string, guess: number): boolean {
    if (this.state !== "guess") return false;
    this.guesses.set(playerID, guess);
    return this.guesses.size === this.players.size;
  }

  public getPlayerAnswer(
    finderID: string,
    nameOfPlayerToGuess: string,
  ): Answer | undefined {
    if (this.consumedCheck.has(finderID)) {
      console.log(`Player ${finderID} has already used up his check`);
      return;
    }
    if (this.state !== "reveal") {
      console.log(`Game state is not reveal yet`);
      return;
    }

    const player = Array.from(this.players).find(
      ([id, player]) => player.name === nameOfPlayerToGuess,
    )?.[1];
    if (!player) return;
    const answer = this.answers.get(player.id);
    if (answer) {
      this.consumedCheck.add(finderID);
      return answer;
    }
  }

  public getAllGuesses(): Map<string, number> {
    return this.guesses;
  }
}

export default GameSession;
