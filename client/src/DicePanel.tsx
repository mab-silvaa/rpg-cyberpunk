import { useState, type FormEvent } from "react";
import {
  DICE_MAX_EXPRESSION_LENGTH,
  type RollReply,
  type RollRequest,
  type RollResult,
  type TermResult,
} from "@vtt/shared";

interface Props {
  rolls: RollResult[];
  isGm: boolean;
  onRoll: (request: RollRequest) => Promise<RollReply>;
}

const QUICK_DICE = [4, 6, 8, 10, 12, 20, 100];

function TermDetail({ term }: { term: TermResult }) {
  if (term.kind === "number")
    return (
      <span className="term">
        {term.sign === -1 ? "−" : "+"}
        {term.value}
      </span>
    );
  const sign = term.sign === -1 ? "−" : "+";
  return (
    <span className="term">
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
      ]
    </span>
  );
}

function RollLine({ roll }: { roll: RollResult }) {
  const effect = roll.terms.find((t) => t.kind === "dice" && t.testEffect);
  return (
    <li className={roll.secret ? "roll secret" : "roll"}>
      <div>
        <strong>{roll.userName}</strong>
        {roll.label ? ` · ${roll.label}` : ""} <code>{roll.expression}</code>
        {roll.secret && <strong className="badge preview">secreta</strong>}
        {roll.critical && <strong className="badge crit">crítico</strong>}
        {effect?.kind === "dice" && effect.testEffect === "explode" && (
          <strong className="badge">10 natural</strong>
        )}
        {effect?.kind === "dice" && effect.testEffect === "fumble" && (
          <strong className="badge crit">1 natural</strong>
        )}
      </div>
      <div className="roll-total">
        <span className="details">
          {roll.terms.map((t, i) => (
            <TermDetail key={i} term={t} />
          ))}
        </span>
        <span className="total" aria-label={`Total ${roll.total}`}>
          = {roll.total}
        </span>
      </div>
    </li>
  );
}

export function DicePanel({ rolls, isGm, onRoll }: Props) {
  const [expression, setExpression] = useState("");
  const [secret, setSecret] = useState(false);
  const [modifier, setModifier] = useState(0);
  const [damageDice, setDamageDice] = useState(3);
  const [error, setError] = useState<string>();

  async function send(text: string, label?: string) {
    setError(undefined);
    const reply = await onRoll({
      expression: text,
      secret: isGm && secret,
      ...(label ? { label } : {}),
    });
    if (!reply.ok) setError(reply.error);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (expression.trim()) void send(expression);
  }

  const testExpression = `1d10!${modifier < 0 ? "-" : "+"}${Math.abs(modifier)}`;

  return (
    <section className="card dice">
      <h2>Dados</h2>
      <form className="dice-form" onSubmit={submit}>
        <input
          aria-label="Rolagem"
          value={expression}
          onChange={(e) => setExpression(e.target.value)}
          maxLength={DICE_MAX_EXPRESSION_LENGTH}
          placeholder="2d6+3"
        />
        <button type="submit">Rolar</button>
        {isGm && (
          <label className="check">
            <input type="checkbox" checked={secret} onChange={(e) => setSecret(e.target.checked)} />
            Secreta (só o mestre vê)
          </label>
        )}
      </form>
      <div className="dice-quick">
        {QUICK_DICE.map((sides) => (
          <button key={sides} onClick={() => void send(`1d${sides}`)}>
            d{sides}
          </button>
        ))}
      </div>
      <div className="dice-quick">
        <label>
          Teste (STAT + skill)
          <input
            type="number"
            value={modifier}
            min={-100}
            max={100}
            onChange={(e) => setModifier(Math.trunc(Number(e.target.value)) || 0)}
          />
        </label>
        <button onClick={() => void send(testExpression, "Teste")}>Teste {testExpression}</button>
        <label>
          Dano (d6)
          <input
            type="number"
            value={damageDice}
            min={1}
            max={20}
            onChange={(e) =>
              setDamageDice(Math.min(20, Math.max(1, Math.trunc(Number(e.target.value)) || 1)))
            }
          />
        </label>
        <button onClick={() => void send(`${damageDice}d6`, "Dano")}>Dano {damageDice}d6</button>
      </div>
      <p className="details">
        No teste, um 10 natural soma outro d10 e um 1 natural subtrai outro d10. No dano, dois ou
        mais 6 contam como crítico. Escreva também contas como 1d10!+8 ou 2d6+1d4−2.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <ul className="rolls" aria-label="Histórico de rolagens">
        {[...rolls].reverse().map((roll) => (
          <RollLine key={roll.id} roll={roll} />
        ))}
        {rolls.length === 0 && <li className="details">Nenhuma rolagem ainda.</li>}
      </ul>
    </section>
  );
}
