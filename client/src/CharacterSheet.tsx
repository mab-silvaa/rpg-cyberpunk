import { useEffect, useRef, useState } from "react";
import {
  checkExpression,
  CHARACTER_LIMITS,
  DEFAULT_SKILLS,
  deathSave,
  humanityMax,
  maxHp,
  seriouslyWoundedAt,
  skillTotal,
  STAT_KEYS,
  woundState,
  type CharacterData,
  type CharacterReply,
  type CharacterView,
  type RollReply,
  type RollRequest,
  type SkillEntry,
  type StatKey,
} from "@vtt/shared";

interface Props {
  character: CharacterView;
  onSave: (id: number, patch: Partial<CharacterData>) => Promise<CharacterReply>;
  onRoll: (request: RollRequest) => Promise<RollReply>;
}

type SaveState = "salvo" | "salvando" | "erro";
const SAVE_DELAY_MS = 600;

function Num({
  label,
  value,
  min = 0,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="num">
      {label}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Math.trunc(Number(e.target.value)) || 0)}
      />
    </label>
  );
}

export function CharacterSheet({ character, onSave, onRoll }: Props) {
  const [data, setData] = useState<CharacterData>(character.data);
  const [syncedAt, setSyncedAt] = useState(character.updatedAt);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<SaveState>("salvo");
  const [message, setMessage] = useState<string>();
  const pending = useRef<Partial<CharacterData>>({});
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Muda a ficha por fora (mestre, ou o próprio save voltando): adota, se não há edição em curso.
  if (character.updatedAt !== syncedAt && !dirty) {
    setSyncedAt(character.updatedAt);
    setData(character.data);
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  function flush() {
    const patch = pending.current;
    pending.current = {};
    setStatus("salvando");
    void onSave(character.id, patch).then((reply) => {
      if (reply.ok) {
        setStatus("salvo");
        setDirty(Object.keys(pending.current).length > 0);
      } else {
        // Devolve o que não foi salvo para tentar de novo junto com a próxima edição.
        pending.current = { ...patch, ...pending.current };
        setStatus("erro");
        setMessage(reply.error);
      }
    });
  }

  function edit<K extends keyof CharacterData>(key: K, value: CharacterData[K]) {
    setData((d) => ({ ...d, [key]: value }));
    pending.current = { ...pending.current, [key]: value };
    setDirty(true);
    setMessage(undefined);
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY_MS);
  }

  const hpMax = maxHp(data);
  const wound = woundState(data);
  const total = (skill: SkillEntry) => skillTotal(data, skill);
  const roll = (expression: string, label: string) =>
    void onRoll({ expression, label }).then((reply) => {
      if (!reply.ok) setMessage(reply.error);
    });

  const updateSkill = (index: number, change: Partial<SkillEntry>) =>
    edit(
      "skills",
      data.skills.map((s, i) => (i === index ? { ...s, ...change } : s)),
    );

  function addDefaultSkills() {
    const have = new Set(data.skills.map((s) => s.name.toLowerCase()));
    edit(
      "skills",
      [...data.skills, ...DEFAULT_SKILLS.filter((s) => !have.has(s.name.toLowerCase()))].slice(
        0,
        CHARACTER_LIMITS.skills,
      ),
    );
  }

  const attackTotal = (skillName: string): number | null => {
    const skill = data.skills.find((s) => s.name.toLowerCase() === skillName.toLowerCase());
    return skill ? total(skill) : null;
  };

  return (
    <div className="sheet">
      <div className="sheet-head">
        <span className={`save-state save-${status}`} role="status">
          {status === "salvo" ? "Salvo" : status === "salvando" ? "Salvando..." : "Não salvou"}
        </span>
      </div>
      {message && (
        <p className="error" role="alert">
          {message}
        </p>
      )}

      <div className="row">
        <label>
          Handle
          <input
            value={data.handle}
            maxLength={40}
            onChange={(e) => edit("handle", e.target.value)}
          />
        </label>
        <label>
          Role
          <input value={data.role} maxLength={40} onChange={(e) => edit("role", e.target.value)} />
        </label>
        <Num label="Rank" value={data.rank} max={10} onChange={(n) => edit("rank", n)} />
      </div>

      <h4>STATs</h4>
      <div className="stats">
        {STAT_KEYS.map((key: StatKey) => (
          <Num
            key={key}
            label={key}
            value={data.stats[key]}
            max={CHARACTER_LIMITS.stat}
            onChange={(n) => edit("stats", { ...data.stats, [key]: n })}
          />
        ))}
      </div>

      <h4>Vitais</h4>
      <div className="stats">
        <Num
          label={`HP (máx. ${hpMax})`}
          value={data.hpCurrent}
          max={hpMax}
          onChange={(n) => edit("hpCurrent", n)}
        />
        <Num
          label={`Humanity (máx. ${humanityMax(data)})`}
          value={data.humanityCurrent}
          max={humanityMax(data)}
          onChange={(n) => edit("humanityCurrent", n)}
        />
        <Num
          label="Luck"
          value={data.luckCurrent}
          max={data.stats.LUCK}
          onChange={(n) => edit("luckCurrent", n)}
        />
        <Num label="SP cabeça" value={data.headSp} max={30} onChange={(n) => edit("headSp", n)} />
        <Num
          label="SP cabeça (máx.)"
          value={data.headSpMax}
          max={30}
          onChange={(n) => edit("headSpMax", n)}
        />
        <Num label="SP corpo" value={data.bodySp} max={30} onChange={(n) => edit("bodySp", n)} />
        <Num
          label="SP corpo (máx.)"
          value={data.bodySpMax}
          max={30}
          onChange={(n) => edit("bodySpMax", n)}
        />
      </div>
      <p className="details">
        Gravemente ferido com HP até {seriouslyWoundedAt(data)} ·{" "}
        {wound === "mortal" ? (
          <strong className="badge crit">Mortalmente ferido</strong>
        ) : wound === "serious" ? (
          <strong className="badge preview">Gravemente ferido</strong>
        ) : (
          <strong className="badge">Em pé</strong>
        )}{" "}
        · Death Save: {deathSave(data)} · EMP atual: {Math.floor(data.humanityCurrent / 10)}
      </p>
      <div className="dice-quick">
        <button onClick={() => roll(`1d10+${data.stats.REF}`, "Iniciativa")}>
          Iniciativa (1d10+REF)
        </button>
        <button
          onClick={() => roll("1d10", `Death Save (precisa tirar menos que ${deathSave(data)})`)}
        >
          Death Save
        </button>
      </div>

      <h4>Skills</h4>
      <table className="skills">
        <thead>
          <tr>
            <th>Skill</th>
            <th>STAT</th>
            <th>Nível</th>
            <th>Total</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data.skills.map((skill, i) => (
            <tr key={i}>
              <td>
                <input
                  aria-label="Nome da skill"
                  value={skill.name}
                  maxLength={40}
                  onChange={(e) => updateSkill(i, { name: e.target.value })}
                />
              </td>
              <td>
                <select
                  aria-label="STAT da skill"
                  value={skill.stat}
                  onChange={(e) => updateSkill(i, { stat: e.target.value as StatKey })}
                >
                  {STAT_KEYS.map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </td>
              <td>
                <input
                  aria-label="Nível da skill"
                  type="number"
                  min={0}
                  max={CHARACTER_LIMITS.skillLevel}
                  value={skill.level}
                  onChange={(e) =>
                    updateSkill(i, { level: Math.trunc(Number(e.target.value)) || 0 })
                  }
                />
              </td>
              <td>{total(skill)}</td>
              <td className="actions">
                <button onClick={() => roll(checkExpression(total(skill)), skill.name)}>
                  Rolar
                </button>
                <button
                  className="link danger"
                  onClick={() =>
                    edit(
                      "skills",
                      data.skills.filter((_, j) => j !== i),
                    )
                  }
                >
                  Tirar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row">
        <button
          onClick={() =>
            edit("skills", [...data.skills, { name: "Nova skill", stat: "INT", level: 0 }])
          }
        >
          Nova skill
        </button>
        <button onClick={addDefaultSkills}>Acrescentar as skills do jogo</button>
      </div>

      <h4>Armas</h4>
      {data.weapons.map((weapon, i) => {
        const update = (change: Partial<typeof weapon>) =>
          edit(
            "weapons",
            data.weapons.map((w, j) => (j === i ? { ...w, ...change } : w)),
          );
        const attack = attackTotal(weapon.skill);
        return (
          <div className="item" key={i}>
            <div className="row">
              <label>
                Arma
                <input
                  value={weapon.name}
                  maxLength={40}
                  onChange={(e) => update({ name: e.target.value })}
                />
              </label>
              <label>
                Skill
                <input
                  list="skill-names"
                  value={weapon.skill}
                  maxLength={40}
                  onChange={(e) => update({ skill: e.target.value })}
                />
              </label>
              <label>
                Dano
                <input
                  value={weapon.damage}
                  maxLength={30}
                  placeholder="3d6"
                  onChange={(e) => update({ damage: e.target.value })}
                />
              </label>
              <Num label="ROF" value={weapon.rof} max={10} onChange={(n) => update({ rof: n })} />
              <Num
                label="Munição"
                value={weapon.ammo}
                max={999}
                onChange={(n) => update({ ammo: n })}
              />
              <Num
                label="Carregador"
                value={weapon.ammoMax}
                max={999}
                onChange={(n) => update({ ammoMax: n })}
              />
            </div>
            <div className="row">
              <button onClick={() => roll(checkExpression(attack ?? 0), `Ataque: ${weapon.name}`)}>
                Atacar {attack === null ? "(skill não encontrada: +0)" : `(+${attack})`}
              </button>
              <button
                disabled={!weapon.damage}
                onClick={() => roll(weapon.damage, `Dano: ${weapon.name}`)}
              >
                Dano {weapon.damage}
              </button>
              <button
                className="link danger"
                onClick={() =>
                  edit(
                    "weapons",
                    data.weapons.filter((_, j) => j !== i),
                  )
                }
              >
                Tirar
              </button>
            </div>
          </div>
        );
      })}
      <datalist id="skill-names">
        {data.skills.map((s) => (
          <option key={s.name} value={s.name} />
        ))}
      </datalist>
      <button
        onClick={() =>
          edit("weapons", [
            ...data.weapons,
            { name: "Nova arma", skill: "", damage: "", rof: 1, ammo: 0, ammoMax: 0, notes: "" },
          ])
        }
      >
        Nova arma
      </button>

      <h4>Cyberware</h4>
      {data.cyberware.map((item, i) => {
        const update = (change: Partial<typeof item>) =>
          edit(
            "cyberware",
            data.cyberware.map((c, j) => (j === i ? { ...c, ...change } : c)),
          );
        return (
          <div className="row" key={i}>
            <label>
              Implante
              <input
                value={item.name}
                maxLength={40}
                onChange={(e) => update({ name: e.target.value })}
              />
            </label>
            <Num
              label="Perda de Humanity"
              value={item.humanityLoss}
              max={99}
              onChange={(n) => update({ humanityLoss: n })}
            />
            <label>
              Notas
              <input
                value={item.notes}
                maxLength={80}
                onChange={(e) => update({ notes: e.target.value })}
              />
            </label>
            <button
              className="link danger"
              onClick={() =>
                edit(
                  "cyberware",
                  data.cyberware.filter((_, j) => j !== i),
                )
              }
            >
              Tirar
            </button>
          </div>
        );
      })}
      <button
        onClick={() =>
          edit("cyberware", [
            ...data.cyberware,
            { name: "Novo implante", humanityLoss: 0, notes: "" },
          ])
        }
      >
        Novo implante
      </button>
      <p className="details">
        Perda de Humanity dos implantes:{" "}
        {data.cyberware.reduce((sum, c) => sum + c.humanityLoss, 0)} (some ao valor de Humanity
        acima quando instalar).
      </p>

      <h4>Equipamento</h4>
      {data.gear.map((item, i) => {
        const update = (change: Partial<typeof item>) =>
          edit(
            "gear",
            data.gear.map((g, j) => (j === i ? { ...g, ...change } : g)),
          );
        return (
          <div className="row" key={i}>
            <label>
              Item
              <input
                value={item.name}
                maxLength={40}
                onChange={(e) => update({ name: e.target.value })}
              />
            </label>
            <Num label="Qtd." value={item.qty} max={9999} onChange={(n) => update({ qty: n })} />
            <label>
              Notas
              <input
                value={item.notes}
                maxLength={80}
                onChange={(e) => update({ notes: e.target.value })}
              />
            </label>
            <button
              className="link danger"
              onClick={() =>
                edit(
                  "gear",
                  data.gear.filter((_, j) => j !== i),
                )
              }
            >
              Tirar
            </button>
          </div>
        );
      })}
      <button
        onClick={() => edit("gear", [...data.gear, { name: "Novo item", qty: 1, notes: "" }])}
      >
        Novo item
      </button>
      <Num
        label="Eurodólares"
        value={data.eddies}
        max={99_999_999}
        onChange={(n) => edit("eddies", n)}
      />

      <h4>História e notas</h4>
      <label>
        Lifepath
        <textarea
          rows={4}
          maxLength={CHARACTER_LIMITS.textLong}
          value={data.lifepath}
          onChange={(e) => edit("lifepath", e.target.value)}
        />
      </label>
      <label>
        Notas
        <textarea
          rows={4}
          maxLength={CHARACTER_LIMITS.textLong}
          value={data.notes}
          onChange={(e) => edit("notes", e.target.value)}
        />
      </label>
    </div>
  );
}
