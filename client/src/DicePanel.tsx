import { useState, type FormEvent } from "react";
import {
  DICE_MAX_EXPRESSION_LENGTH,
  type RollReply,
  type RollRequest,
  type RollResult,
  type TermResult,
} from "@vtt/shared";
import { Icon } from "./icons";
import { Badge, Button, Card, ErrorText, IconButton } from "./ui";

type OnRoll = (request: RollRequest) => Promise<RollReply>;

export const QUICK_DICE = [4, 6, 8, 10, 12, 20, 100];

/** Estado compartilhado das peças de dados: expressão, rolagem secreta e erro. */
export function useDice(onRoll: OnRoll, isGm: boolean) {
  const [expression, setExpression] = useState("");
  const [secret, setSecret] = useState(false);
  const [error, setError] = useState<string>();

  async function send(text: string, label?: string, forceSecret?: boolean) {
    setError(undefined);
    const reply = await onRoll({
      expression: text,
      secret: isGm && (forceSecret ?? secret),
      ...(label ? { label } : {}),
    });
    if (!reply.ok) setError(reply.error);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (expression.trim()) void send(expression);
  }

  return { expression, setExpression, secret, setSecret, error, send, submit };
}
export type Dice = ReturnType<typeof useDice>;

function TermDetail({ term }: { term: TermResult }) {
  const sign = term.sign === -1 ? "−" : "+";
  if (term.kind === "number")
    return (
      <span>
        {sign}
        {term.value}{" "}
      </span>
    );
  return (
    <span>
      {sign}
      {term.count}d{term.sides}
      {term.test ? "!" : ""} [
      {term.test ? (
        <>
          {term.rolls[0]}
          {term.rolls[1] !== undefined && (
            <span className={`extra ${term.testEffect}`}>
              {term.testEffect === "fumble" ? " − " : " + "}
              {term.rolls[1]}
            </span>
          )}
        </>
      ) : (
        term.rolls.join(", ")
      )}
      ]{" "}
    </span>
  );
}

function rollInfo(roll: RollResult) {
  const effect = roll.terms.find((t) => t.kind === "dice" && t.testEffect);
  const testEffect = effect?.kind === "dice" ? effect.testEffect : undefined;
  const tone = roll.secret
    ? "secret"
    : roll.critical || testEffect === "explode"
      ? "crit"
      : testEffect === "fumble"
        ? "fumble"
        : "";
  return { testEffect, tone };
}

function RollBadges({ roll }: { roll: RollResult }) {
  const { testEffect } = rollInfo(roll);
  return (
    <>
      {roll.secret && (
        <Badge tone="gm" icon="eyeoff">
          Secreta
        </Badge>
      )}
      {testEffect === "explode" && <Badge tone="ok">10 natural</Badge>}
      {testEffect === "fumble" && <Badge tone="danger">1 natural</Badge>}
      {roll.critical && <Badge tone="turn">Crítico</Badge>}
    </>
  );
}

/** Cada rolagem é um cartão; o total é o protagonista, colorido pelo resultado. */
export function RollCard({ roll }: { roll: RollResult }) {
  const { tone } = rollInfo(roll);
  const cardTone = roll.secret
    ? "gm"
    : tone === "crit"
      ? "turn"
      : tone === "fumble"
        ? "danger"
        : undefined;
  return (
    <li className={roll.secret ? "roll secret" : "roll"}>
      <Card tone={cardTone}>
        <div className="roll-body">
          <div className="roll-head">
            <span className="t-label">{roll.userName}</span>
            <span style={{ flex: 1 }} />
            <RollBadges roll={roll} />
          </div>
          <div className="roll-expr">
            {roll.label ? `${roll.label} · ` : ""}
            {roll.expression}
          </div>
          <div className="roll-parts">
            {roll.terms.map((t, i) => (
              <TermDetail key={i} term={t} />
            ))}
          </div>
          <div className={`total ${tone}`} aria-label={`Total ${roll.total}`}>
            = {roll.total}
          </div>
        </div>
      </Card>
    </li>
  );
}

/** Última rolagem: fica fixa na barra do mapa e no topo da aba Dados. */
export function LastRoll({
  roll,
  label = "Última rolagem",
}: {
  roll: RollResult | undefined;
  label?: string;
}) {
  if (!roll) {
    return (
      <div className="dice-last">
        <span className="t-label">{label}</span>
        <span className="details">Nenhuma ainda.</span>
      </div>
    );
  }
  const { tone } = rollInfo(roll);
  return (
    <div className="dice-last" aria-live="polite">
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span className="t-label">{label}</span>
        <span style={{ flex: 1 }} />
        <RollBadges roll={roll} />
      </div>
      <div className="details t-mono">
        {roll.userName} · {roll.expression}
      </div>
      <div className={`total-big total ${tone}`}>= {roll.total}</div>
      <div className="roll-parts">
        {roll.terms.map((t, i) => (
          <TermDetail key={i} term={t} />
        ))}
      </div>
    </div>
  );
}

function DiceRow({ dice, sides }: { dice: Dice; sides: number[] }) {
  return (
    <div className="dice-row">
      {sides.map((s) => (
        <button key={s} type="button" className="die" onClick={() => void dice.send(`1d${s}`)}>
          d{s}
        </button>
      ))}
    </div>
  );
}

function ExpressionRow({ dice, isGm }: { dice: Dice; isGm: boolean }) {
  return (
    <form className="dice-row" style={{ gap: 8 }} onSubmit={dice.submit}>
      <span className="control mono" style={{ flex: 1, minWidth: 0 }}>
        <input
          aria-label="Expressão de dados"
          value={dice.expression}
          onChange={(e) => dice.setExpression(e.target.value)}
          maxLength={DICE_MAX_EXPRESSION_LENGTH}
          placeholder="2d6+3"
        />
      </span>
      <Button type="submit" variant="primary">
        Rolar
      </Button>
      {isGm && (
        <IconButton
          icon="eyeoff"
          label="Rolar em segredo (só o mestre vê)"
          variant="gm"
          disabled={!dice.expression.trim()}
          onClick={() => {
            if (dice.expression.trim()) void dice.send(dice.expression, undefined, true);
          }}
        />
      )}
    </form>
  );
}

/** Barra de dados fixa sobre o mapa (PC). */
export function DiceBar({
  dice,
  isGm,
  last,
}: {
  dice: Dice;
  isGm: boolean;
  /** Última rolagem: de todos para o mestre, só a do jogador para ele. */
  last: RollResult | undefined;
}) {
  return (
    <div className="float dice-bar">
      <div className="float-in">
        <div className="dice-bar-body">
          <div className="dice-controls">
            <DiceRow dice={dice} sides={QUICK_DICE.slice(0, 6)} />
            <ExpressionRow dice={dice} isGm={isGm} />
            {dice.error && (
              <span className="field-msg" role="alert">
                <Icon name="alert" size={14} />
                {dice.error}
              </span>
            )}
          </div>
          <LastRoll roll={last} label={isGm ? "Última rolagem" : "SUA ÚLTIMA ROLAGEM"} />
        </div>
      </div>
    </div>
  );
}

/** Dados do celular (aba Dados): fileira de dados e expressão; o histórico vem abaixo. */
export function DiceTab({ dice, isGm }: { dice: Dice; isGm: boolean }) {
  return (
    <>
      <div className="dice-row" style={{ overflow: "hidden" }}>
        {QUICK_DICE.map((s) => (
          <button
            key={s}
            type="button"
            className="die"
            style={{ flex: 1, minWidth: 0, height: 48 }}
            onClick={() => void dice.send(`1d${s}`)}
          >
            d{s}
          </button>
        ))}
      </div>
      <ExpressionRow dice={dice} isGm={isGm} />
      <ErrorText>{dice.error}</ErrorText>
    </>
  );
}
