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

import { Icon, type IconName } from "./icons";
import {
  Badge,
  Button,
  ErrorText,
  Field,
  IconButton,
  MoreMenu,
  Stepper,
  Tabs,
  TextArea,
  TextField,
  type TabItem,
} from "./ui";

type SaveState = "salvo" | "salvando" | "erro";
const SAVE_DELAY_MS = 600;

/** Número da ficha com − e +, em fonte monoespaçada. */
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
    <Field label={label} group>
      <Stepper
        label={label}
        value={value}
        min={min}
        max={max}
        onChange={(n) => onChange(Math.trunc(n) || 0)}
      />
    </Field>
  );
}

type SheetTab = "stats" | "skills" | "armas" | "cyber" | "equip" | "historia";
const SHEET_TABS: TabItem<SheetTab>[] = [
  { key: "stats", label: "STATs", icon: "user" },
  { key: "skills", label: "Skills", icon: "dice" },
  { key: "armas", label: "Armas", icon: "order" },
  { key: "cyber", label: "Cyberware", icon: "play" },
  { key: "equip", label: "Equipamento", icon: "shield" },
  { key: "historia", label: "História", icon: "sheet" },
];

export function Vital({
  icon,
  label,
  value,
  max,
  tone,
}: {
  icon: IconName;
  label: string;
  value: number;
  max: number;
  tone: "ok" | "accent" | "turn";
}) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const barTone = tone === "ok" ? (value <= 0 ? "danger" : ratio <= 0.5 ? "turn" : "") : tone;
  return (
    <div className="vital">
      <div className="vital-head">
        <Icon name={icon} size={16} />
        {label}
        <b>
          {value}/{max}
        </b>
      </div>
      <div className={`bar ${barTone}`}>
        <i style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
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

  const [tab, setTab] = useState<SheetTab>("stats");
  const skillNames = data.skills.map((s) => s.name);
  const effMax = humanityMax(data);

  /** Lista de itens (armas, implantes, equipamento): editar, tirar e acrescentar. */
  const removeAt = <K extends "weapons" | "cyberware" | "gear">(key: K, i: number) =>
    edit(key, data[key].filter((_, j) => j !== i) as CharacterData[K]);

  return (
    <div className="sheet">
      <div className="sheet-summary">
        <div className="sheet-id">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="t-label">Handle</div>
            <div className="sheet-handle">{data.handle || "Sem nome"}</div>
            <div className="details">
              {data.role || "Sem role"} · Rank {data.rank}
            </div>
          </div>
          <span className="save-state" role="status">
            {status === "salvo" ? (
              <Badge tone="ok" icon="check">
                Salvo
              </Badge>
            ) : status === "salvando" ? (
              <Badge tone="accent" icon="refresh">
                Salvando...
              </Badge>
            ) : (
              <Badge tone="danger" icon="alert">
                Não salvou
              </Badge>
            )}
          </span>
        </div>
        <div className="vitals">
          <Vital icon="heart" label="HP" value={data.hpCurrent} max={hpMax} tone="ok" />
          <Vital
            icon="shield"
            label="SP cabeça"
            value={data.headSp}
            max={data.headSpMax}
            tone="accent"
          />
          <Vital
            icon="user"
            label="Humanity"
            value={data.humanityCurrent}
            max={effMax}
            tone="turn"
          />
          <Vital
            icon="shield"
            label="SP corpo"
            value={data.bodySp}
            max={data.bodySpMax}
            tone="accent"
          />
        </div>
        <div className="actions">
          {wound === "mortal" ? (
            <Badge tone="danger" icon="alert">
              Mortalmente ferido
            </Badge>
          ) : wound === "serious" ? (
            <Badge tone="turn" icon="alert">
              Gravemente ferido
            </Badge>
          ) : (
            <Badge tone="ok">Em pé</Badge>
          )}
          <span className="details t-mono">Death Save {deathSave(data)}</span>
        </div>
        <div className="actions">
          <Button
            size="sm"
            icon="dice"
            onClick={() => roll(`1d10+${data.stats.REF}`, "Iniciativa")}
          >
            Iniciativa 1d10+REF
          </Button>
          <Button
            size="sm"
            onClick={() => roll("1d10", `Death Save (precisa tirar menos que ${deathSave(data)})`)}
          >
            Death Save
          </Button>
        </div>
        <p className="details" style={{ color: "var(--text-dim)" }}>
          Salva sozinha a cada mudança.
        </p>
        <ErrorText>{message}</ErrorText>
      </div>

      <Tabs tabs={SHEET_TABS} active={tab} onChange={setTab} row label="Seções da ficha" />

      {tab === "stats" && (
        <>
          <div className="form-row">
            <TextField
              label="Handle"
              value={data.handle}
              maxLength={40}
              onChange={(e) => edit("handle", e.target.value)}
            />
            <TextField
              label="Role"
              value={data.role}
              maxLength={40}
              onChange={(e) => edit("role", e.target.value)}
            />
          </div>
          <Num label="Rank" value={data.rank} max={10} onChange={(n) => edit("rank", n)} />
          <h4 className="t-block">STATs</h4>
          <div className="stats">
            {STAT_KEYS.map((key: StatKey) => (
              <label className="stat" key={key}>
                <span className="t-label">{key}</span>
                <input
                  type="number"
                  value={data.stats[key]}
                  min={0}
                  max={CHARACTER_LIMITS.stat}
                  onChange={(e) =>
                    edit("stats", { ...data.stats, [key]: Math.trunc(Number(e.target.value)) || 0 })
                  }
                />
              </label>
            ))}
          </div>
          <h4 className="t-block">Vitais</h4>
          <div className="form-row">
            <Num
              label={`HP (máx. ${hpMax})`}
              value={data.hpCurrent}
              max={hpMax}
              onChange={(n) => edit("hpCurrent", n)}
            />
            <Num
              label={`Humanity (máx. ${effMax})`}
              value={data.humanityCurrent}
              max={effMax}
              onChange={(n) => edit("humanityCurrent", n)}
            />
            <Num
              label="Luck"
              value={data.luckCurrent}
              max={data.stats.LUCK}
              onChange={(n) => edit("luckCurrent", n)}
            />
          </div>
          <div className="form-row">
            <Num
              label="SP cabeça"
              value={data.headSp}
              max={30}
              onChange={(n) => edit("headSp", n)}
            />
            <Num
              label="SP cabeça (máx.)"
              value={data.headSpMax}
              max={30}
              onChange={(n) => edit("headSpMax", n)}
            />
          </div>
          <div className="form-row">
            <Num
              label="SP corpo"
              value={data.bodySp}
              max={30}
              onChange={(n) => edit("bodySp", n)}
            />
            <Num
              label="SP corpo (máx.)"
              value={data.bodySpMax}
              max={30}
              onChange={(n) => edit("bodySpMax", n)}
            />
          </div>
          <p className="details">
            Gravemente ferido com HP até {seriouslyWoundedAt(data)} · EMP atual:{" "}
            {Math.floor(data.humanityCurrent / 10)}
          </p>
        </>
      )}

      {tab === "skills" && (
        <>
          <div className="skill head t-label">
            <span>Skill</span>
            <span>STAT</span>
            <span>Nível</span>
            <span>Total</span>
            <span />
          </div>
          {data.skills.map((skill, i) => (
            <div className="skill" key={i}>
              <span className="control">
                <input
                  aria-label="Nome da skill"
                  value={skill.name}
                  maxLength={40}
                  onChange={(e) => updateSkill(i, { name: e.target.value })}
                />
              </span>
              <span className="control">
                <select
                  aria-label="STAT da skill"
                  value={skill.stat}
                  onChange={(e) => updateSkill(i, { stat: e.target.value as StatKey })}
                >
                  {STAT_KEYS.map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </span>
              <span className="control mono">
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
              </span>
              <span className="skill-total">{total(skill)}</span>
              <MoreMenu
                label={`Mais ações de ${skill.name || "skill"}`}
                items={[
                  {
                    label: "Rolar",
                    icon: "dice",
                    onSelect: () => roll(checkExpression(total(skill)), skill.name),
                  },
                  {
                    label: "Tirar",
                    icon: "trash",
                    danger: true,
                    onSelect: () =>
                      edit(
                        "skills",
                        data.skills.filter((_, j) => j !== i),
                      ),
                  },
                ]}
              />
            </div>
          ))}
          <div className="actions">
            <Button
              icon="plus"
              onClick={() =>
                edit("skills", [...data.skills, { name: "Nova skill", stat: "INT", level: 0 }])
              }
            >
              Nova skill
            </Button>
            <Button onClick={addDefaultSkills}>Acrescentar as skills do jogo</Button>
          </div>
          <p className="details">
            O botão do menu rola 1d10 explosivo + total, e o resultado cai no histórico da mesa.
          </p>
        </>
      )}

      {tab === "armas" && (
        <>
          {data.weapons.map((weapon, i) => {
            const update = (change: Partial<typeof weapon>) =>
              edit(
                "weapons",
                data.weapons.map((w, j) => (j === i ? { ...w, ...change } : w)),
              );
            const attack = attackTotal(weapon.skill);
            return (
              <div className="item-card" key={i}>
                <div className="form-row">
                  <TextField
                    label="Arma"
                    value={weapon.name}
                    maxLength={40}
                    onChange={(e) => update({ name: e.target.value })}
                  />
                  <TextField
                    label="Skill"
                    list="skill-names"
                    value={weapon.skill}
                    maxLength={40}
                    onChange={(e) => update({ skill: e.target.value })}
                  />
                  <TextField
                    label="Dano"
                    mono
                    value={weapon.damage}
                    maxLength={30}
                    placeholder="3d6"
                    onChange={(e) => update({ damage: e.target.value })}
                  />
                </div>
                <div className="form-row">
                  <Num
                    label="ROF"
                    value={weapon.rof}
                    max={10}
                    onChange={(n) => update({ rof: n })}
                  />
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
                <div className="actions">
                  <Button
                    variant="primary"
                    size="sm"
                    icon="dice"
                    onClick={() => roll(checkExpression(attack ?? 0), `Ataque: ${weapon.name}`)}
                  >
                    Atacar {attack === null ? "(skill não encontrada: +0)" : `(+${attack})`}
                  </Button>
                  <Button
                    size="sm"
                    disabled={!weapon.damage}
                    onClick={() => roll(weapon.damage, `Dano: ${weapon.name}`)}
                  >
                    Dano {weapon.damage}
                  </Button>
                  <span style={{ flex: 1 }} />
                  <IconButton
                    icon="trash"
                    label={`Tirar ${weapon.name || "arma"}`}
                    variant="danger"
                    size="sm"
                    onClick={() => removeAt("weapons", i)}
                  />
                </div>
              </div>
            );
          })}
          <datalist id="skill-names">
            {skillNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <div className="actions">
            <Button
              icon="plus"
              onClick={() =>
                edit("weapons", [
                  ...data.weapons,
                  {
                    name: "Nova arma",
                    skill: "",
                    damage: "",
                    rof: 1,
                    ammo: 0,
                    ammoMax: 0,
                    notes: "",
                  },
                ])
              }
            >
              Nova arma
            </Button>
          </div>
        </>
      )}

      {tab === "cyber" && (
        <>
          {data.cyberware.map((item, i) => {
            const update = (change: Partial<typeof item>) =>
              edit(
                "cyberware",
                data.cyberware.map((c, j) => (j === i ? { ...c, ...change } : c)),
              );
            return (
              <div className="item-card" key={i}>
                <div className="form-row">
                  <TextField
                    label="Implante"
                    value={item.name}
                    maxLength={40}
                    onChange={(e) => update({ name: e.target.value })}
                  />
                  <Num
                    label="Perda de Humanity"
                    value={item.humanityLoss}
                    max={99}
                    onChange={(n) => update({ humanityLoss: n })}
                  />
                </div>
                <TextField
                  label="Notas"
                  value={item.notes}
                  maxLength={80}
                  onChange={(e) => update({ notes: e.target.value })}
                />
                <div className="actions">
                  <span style={{ flex: 1 }} />
                  <IconButton
                    icon="trash"
                    label={`Tirar ${item.name || "implante"}`}
                    variant="danger"
                    size="sm"
                    onClick={() => removeAt("cyberware", i)}
                  />
                </div>
              </div>
            );
          })}
          <div className="actions">
            <Button
              icon="plus"
              onClick={() =>
                edit("cyberware", [
                  ...data.cyberware,
                  { name: "Novo implante", humanityLoss: 0, notes: "" },
                ])
              }
            >
              Novo implante
            </Button>
          </div>
          <p className="details">
            Perda de Humanity dos implantes:{" "}
            {data.cyberware.reduce((sum, c) => sum + c.humanityLoss, 0)} (some ao valor de Humanity
            acima quando instalar).
          </p>
        </>
      )}

      {tab === "equip" && (
        <>
          {data.gear.map((item, i) => {
            const update = (change: Partial<typeof item>) =>
              edit(
                "gear",
                data.gear.map((g, j) => (j === i ? { ...g, ...change } : g)),
              );
            return (
              <div className="item-card" key={i}>
                <div className="form-row">
                  <TextField
                    label="Item"
                    value={item.name}
                    maxLength={40}
                    onChange={(e) => update({ name: e.target.value })}
                  />
                  <Num
                    label="Qtd."
                    value={item.qty}
                    max={9999}
                    onChange={(n) => update({ qty: n })}
                  />
                </div>
                <TextField
                  label="Notas"
                  value={item.notes}
                  maxLength={80}
                  onChange={(e) => update({ notes: e.target.value })}
                />
                <div className="actions">
                  <span style={{ flex: 1 }} />
                  <IconButton
                    icon="trash"
                    label={`Tirar ${item.name || "item"}`}
                    variant="danger"
                    size="sm"
                    onClick={() => removeAt("gear", i)}
                  />
                </div>
              </div>
            );
          })}
          <div className="actions">
            <Button
              icon="plus"
              onClick={() => edit("gear", [...data.gear, { name: "Novo item", qty: 1, notes: "" }])}
            >
              Novo item
            </Button>
          </div>
          <Num
            label="Eurodólares"
            value={data.eddies}
            max={99_999_999}
            onChange={(n) => edit("eddies", n)}
          />
        </>
      )}

      {tab === "historia" && (
        <>
          <TextArea
            label="Lifepath"
            rows={5}
            maxLength={CHARACTER_LIMITS.textLong}
            value={data.lifepath}
            onChange={(e) => edit("lifepath", e.target.value)}
          />
          <TextArea
            label="Notas"
            rows={5}
            maxLength={CHARACTER_LIMITS.textLong}
            value={data.notes}
            onChange={(e) => edit("notes", e.target.value)}
          />
        </>
      )}
    </div>
  );
}
