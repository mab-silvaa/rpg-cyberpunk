import crypto from "node:crypto";
import type Database from "better-sqlite3";
import {
  parseDice,
  rollTerms,
  ROLL_LABEL_MAX_LENGTH,
  type DiceOutcome,
  type RollReply,
  type RollRequest,
  type RollResult,
  type User,
} from "@vtt/shared";
import type { VttServer, VttSocket } from "./app.js";

interface RollRow {
  id: number;
  user_id: number | null;
  user_name: string;
  expression: string;
  label: string | null;
  secret: number;
  outcome: string;
  created_at: string;
}

const toResult = (row: RollRow): RollResult => ({
  ...(JSON.parse(row.outcome) as DiceOutcome),
  id: row.id,
  userId: row.user_id ?? 0,
  userName: row.user_name,
  expression: row.expression,
  label: row.label,
  secret: row.secret === 1,
  at: row.created_at,
});

/** Dado de 1 a max, sorteado pelo gerador criptográfico do sistema. */
export const secureRandomInt = (max: number): number => crypto.randomInt(1, max + 1);

export class Rolls {
  constructor(
    private db: Database.Database,
    private random: (max: number) => number = secureRandomInt,
  ) {}

  /** Rola e grava. Devolve o erro em português se a expressão não presta. */
  roll(user: User, request: RollRequest): RollReply {
    const raw = request as Partial<RollRequest> | null;
    if (!raw || typeof raw.expression !== "string") {
      return { ok: false, error: "Digite uma rolagem, como 1d10+8" };
    }
    const secret = raw.secret === true;
    if (secret && !user.isGm) return { ok: false, error: "Só o mestre faz rolagem secreta" };
    const label =
      typeof raw.label === "string"
        ? raw.label
            .replace(/\p{Cc}/gu, "")
            .trim()
            .slice(0, ROLL_LABEL_MAX_LENGTH) || null
        : null;

    const parsed = parseDice(raw.expression);
    if (!parsed.ok) return parsed;
    const outcome = rollTerms(parsed.terms, this.random);
    const saved = this.db
      .prepare(
        "INSERT INTO rolls (user_id, user_name, expression, label, secret, outcome) VALUES (?, ?, ?, ?, ?, ?) RETURNING id, created_at",
      )
      .get(
        user.id,
        user.name,
        parsed.normalized,
        label,
        secret ? 1 : 0,
        JSON.stringify(outcome),
      ) as { id: number; created_at: string };
    return {
      ok: true,
      roll: {
        ...outcome,
        id: saved.id,
        userId: user.id,
        userName: user.name,
        expression: parsed.normalized,
        label,
        secret,
        at: saved.created_at,
      },
    };
  }

  /** As últimas rolagens, da mais antiga para a mais nova. Secretas só se pedido. */
  recent(includeSecret: boolean, limit = 50): RollResult[] {
    const rows = this.db
      .prepare(
        `SELECT id, user_id, user_name, expression, label, secret, outcome, created_at FROM rolls
         ${includeSecret ? "" : "WHERE secret = 0"} ORDER BY id DESC LIMIT ?`,
      )
      .all(limit) as RollRow[];
    return rows.reverse().map(toResult);
  }
}

const MAX_ROLLS_PER_SECOND = 8;

/** Evento `dice:roll` por conexão. */
export function registerDiceSocket(socket: VttSocket, io: VttServer, rolls: Rolls): void {
  const { user } = socket.data;
  let windowStart = 0;
  let inWindow = 0;

  socket.on("dice:roll", (request, ack) => {
    if (typeof ack !== "function") return;
    const now = Date.now();
    if (now - windowStart >= 1000) {
      windowStart = now;
      inWindow = 0;
    }
    if (++inWindow > MAX_ROLLS_PER_SECOND) {
      return ack({ ok: false, error: "Calma! Muitas rolagens de uma vez" });
    }
    const reply = rolls.roll(user, request);
    ack(reply);
    if (!reply.ok) return;
    // Rolagem secreta: só o mestre recebe, inclusive quando é outro mestre.
    if (reply.roll.secret) io.to("gm").except(socket.id).emit("dice:result", reply.roll);
    else socket.broadcast.emit("dice:result", reply.roll);
  });
}
