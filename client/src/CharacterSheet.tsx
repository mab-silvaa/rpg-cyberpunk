import { useEffect, useRef, useState, type ReactNode } from "react";
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
  /** Somente leitura (ficha de outra pessoa). */
  readOnly?: boolean;
}

import { Icon, type IconName } from "./icons";
import { Badge, Button, ErrorText, IconButton } from "./ui";

type SaveState = "salvo" | "salvando" | "erro";
const SAVE_DELAY_MS = 600;

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

export function CharacterSheet({ character, onSave, onRoll, readOnly }: Props) {
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

  const skillNames = data.skills.map((s) => s.name);
  const ro = readOnly === true;
  const effMax = humanityMax(data);

  /** Lista de itens (armas, implantes, equipamento): editar, tirar e acrescentar. */
  const removeAt = <K extends "weapons" | "cyberware" | "gear">(key: K, i: number) =>
    edit(key, data[key].filter((_, j) => j !== i) as CharacterData[K]);

  const half = Math.ceil(data.skills.length / 2);
  const skillRow = (skill: SkillEntry, i: number) => (
    <div className="p-skill" key={i}>
      <span className="p-cell grow">
        <input
          aria-label="Nome da skill"
          value={skill.name}
          maxLength={40}
          disabled={ro}
          onChange={(e) => updateSkill(i, { name: e.target.value })}
        />
      </span>
      <span className="p-cell stat">
        <select
          aria-label="STAT da skill"
          value={skill.stat}
          disabled={ro}
          onChange={(e) => updateSkill(i, { stat: e.target.value as StatKey })}
        >
          {STAT_KEYS.map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
      </span>
      <span className="p-level">
        <button
          type="button"
          className="p-step only-mobile"
          aria-label={`Diminuir nível de ${skill.name}`}
          disabled={ro || skill.level <= 0}
          onClick={() => updateSkill(i, { level: skill.level - 1 })}
        >
          <Icon name="minus" size={16} />
        </button>
        <span className="p-cell lvl">
          <input
            aria-label="Nível da skill"
            type="number"
            min={0}
            max={CHARACTER_LIMITS.skillLevel}
            value={skill.level}
            disabled={ro}
            onChange={(e) => updateSkill(i, { level: Math.trunc(Number(e.target.value)) || 0 })}
          />
        </span>
        <button
          type="button"
          className="p-step only-mobile"
          aria-label={`Aumentar nível de ${skill.name}`}
          disabled={ro || skill.level >= CHARACTER_LIMITS.skillLevel}
          onClick={() => updateSkill(i, { level: skill.level + 1 })}
        >
          <Icon name="plus" size={16} />
        </button>
      </span>
      <b className="p-total">{total(skill)}</b>
      <span className="p-actions">
        <IconButton
          icon="dice"
          size="sm"
          variant="ghost"
          label={`Rolar ${skill.name || "skill"}`}
          onClick={() => roll(checkExpression(total(skill)), skill.name)}
        />
        {!ro && (
          <IconButton
            icon="trash"
            size="sm"
            variant="ghost"
            label={`Tirar ${skill.name || "skill"}`}
            onClick={() =>
              edit(
                "skills",
                data.skills.filter((_, j) => j !== i),
              )
            }
          />
        )}
      </span>
    </div>
  );
  const skillHead = (
    <div className="p-skill p-head">
      <span className="grow">Skill</span>
      <span className="stat">STAT</span>
      <span className="p-level">Nív.</span>
      <span className="p-total">Total</span>
      <span className="p-actions" />
    </div>
  );

  const hpOver = data.hpCurrent > hpMax;

  return (
    <div className="paper">
      <div className="p-band">
        <span className="p-brand">SALANDRA</span>
        <span className="p-title">Ficha de personagem</span>
        <span className="grow" />
        <span className="save-state" role="status">
          {ro ? (
            <Badge icon="lock">Somente leitura</Badge>
          ) : status === "salvo" ? (
            <Badge tone="ok" icon="check">
              Salvo
            </Badge>
          ) : status === "salvando" ? (
            <Badge tone="accent" icon="refresh">
              Salvando…
            </Badge>
          ) : (
            <Badge tone="danger" icon="alert">
              Não salvou
            </Badge>
          )}
        </span>
      </div>

      <div className="p-grid id">
        <Box label="Handle" className="span2">
          <input
            value={data.handle}
            maxLength={40}
            disabled={ro}
            onChange={(e) => edit("handle", e.target.value)}
          />
        </Box>
        <Box label="Role" className="span2">
          <input
            value={data.role}
            maxLength={40}
            disabled={ro}
            onChange={(e) => edit("role", e.target.value)}
          />
        </Box>
        <Box label="Rank">
          <NumInput
            value={data.rank}
            min={0}
            max={10}
            disabled={ro}
            onValue={(n) => edit("rank", n)}
          />
        </Box>
        <div className="p-box p-roll">
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
      </div>

      <div className="p-grid stats">
        {STAT_KEYS.map((key: StatKey) => (
          <Box label={key} key={key} big>
            <input
              type="number"
              min={0}
              max={CHARACTER_LIMITS.stat}
              disabled={ro}
              value={data.stats[key]}
              onChange={(e) =>
                edit("stats", { ...data.stats, [key]: Math.trunc(Number(e.target.value)) || 0 })
              }
            />
          </Box>
        ))}
      </div>

      <div className="p-cols">
        <div className="p-col">
          <h4 className="p-strip">Vitais e armadura</h4>
          <div className="p-grid vitals3">
            <Box
              label="HP"
              suffix={`/ ${hpMax}`}
              error={hpOver ? `HP máximo é ${hpMax}.` : undefined}
            >
              <NumInput
                value={data.hpCurrent}
                min={0}
                max={CHARACTER_LIMITS.hp}
                disabled={ro}
                onValue={(n) => edit("hpCurrent", n)}
              />
            </Box>
            <Box label="Humanity" suffix={`/ ${effMax}`}>
              <NumInput
                value={data.humanityCurrent}
                min={0}
                max={999}
                disabled={ro}
                onValue={(n) => edit("humanityCurrent", n)}
              />
            </Box>
            <Box label="Luck" suffix={`/ ${data.stats.LUCK}`}>
              <NumInput
                value={data.luckCurrent}
                min={0}
                max={999}
                disabled={ro}
                onValue={(n) => edit("luckCurrent", n)}
              />
            </Box>
            <Box label="Death Save" readOnly>
              <input readOnly value={deathSave(data)} disabled />
            </Box>
            <Box label="SP cabeça" suffix={`/ ${data.headSpMax}`}>
              <NumInput
                value={data.headSp}
                min={0}
                max={30}
                disabled={ro}
                onValue={(n) => edit("headSp", n)}
              />
            </Box>
            <Box label="SP corpo" suffix={`/ ${data.bodySpMax}`}>
              <NumInput
                value={data.bodySp}
                min={0}
                max={30}
                disabled={ro}
                onValue={(n) => edit("bodySp", n)}
              />
            </Box>
            <Box label="SP cabeça (máx.)">
              <NumInput
                value={data.headSpMax}
                min={0}
                max={30}
                disabled={ro}
                onValue={(n) => edit("headSpMax", n)}
              />
            </Box>
            <Box label="SP corpo (máx.)">
              <NumInput
                value={data.bodySpMax}
                min={0}
                max={30}
                disabled={ro}
                onValue={(n) => edit("bodySpMax", n)}
              />
            </Box>
            <Box label="EMP atual" readOnly>
              <input readOnly value={Math.floor(data.humanityCurrent / 10)} disabled />
            </Box>
          </div>
          <div className="p-state">
            <span className="t-label">Estado</span>
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
          </div>
          <div className="p-track-wrap">
            <span className="t-label">Trilha de HP</span>
            <div className="p-track" aria-hidden="true">
              {Array.from({ length: Math.min(hpMax, 60) }, (_, n) => (
                <i
                  key={n}
                  className={`${n < data.hpCurrent ? "on" : ""} ${n < seriouslyWoundedAt(data) ? "serious" : ""}`}
                />
              ))}
            </div>
            <span className="details">
              zona de ferimento grave (até {seriouslyWoundedAt(data)})
            </span>
          </div>

          <h4 className="p-strip">Cyberware</h4>
          <div className="p-table">
            <div className="p-row p-head cyber">
              <span className="grow">Implante</span>
              <span className="w-loss">Perda de Humanity</span>
              <span className="p-actions" />
            </div>
            {data.cyberware.map((item, i) => {
              const update = (change: Partial<typeof item>) =>
                edit(
                  "cyberware",
                  data.cyberware.map((c, j) => (j === i ? { ...c, ...change } : c)),
                );
              return (
                <div className="p-row cyber" key={i}>
                  <span className="p-cell grow">
                    <input
                      aria-label="Implante"
                      value={item.name}
                      maxLength={40}
                      disabled={ro}
                      onChange={(e) => update({ name: e.target.value })}
                    />
                  </span>
                  <span className="p-cell w-loss mono">
                    <input
                      aria-label="Perda de Humanity"
                      type="number"
                      min={0}
                      max={99}
                      value={item.humanityLoss}
                      disabled={ro}
                      onChange={(e) =>
                        update({ humanityLoss: Math.trunc(Number(e.target.value)) || 0 })
                      }
                    />
                  </span>
                  <span className="p-actions">
                    {!ro && (
                      <IconButton
                        icon="trash"
                        size="sm"
                        variant="ghost"
                        label={`Tirar ${item.name || "implante"}`}
                        onClick={() => removeAt("cyberware", i)}
                      />
                    )}
                  </span>
                </div>
              );
            })}
            {Array.from({ length: Math.max(0, 2 - data.cyberware.length) }, (_, n) => (
              <div className="p-row blank" key={`b${n}`} aria-hidden="true" />
            ))}
            <div className="p-row p-sum">
              <span className="grow t-label">Perda total</span>
              <b className="w-loss t-mono">
                −{data.cyberware.reduce((sum, c) => sum + c.humanityLoss, 0)}
              </b>
              <span className="p-actions" />
            </div>
          </div>
          {!ro && (
            <div className="p-add">
              <Button
                size="sm"
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
          )}
        </div>

        <div className="p-col">
          <h4 className="p-strip">Skills</h4>
          <div className="p-skill-cols">
            <div className="p-table">
              {skillHead}
              {data.skills.slice(0, half).map((skill, i) => skillRow(skill, i))}
            </div>
            <div className="p-table">
              {skillHead}
              {data.skills.slice(half).map((skill, i) => skillRow(skill, half + i))}
            </div>
          </div>
          {!ro && (
            <div className="p-add">
              <Button
                size="sm"
                icon="plus"
                onClick={() =>
                  edit("skills", [...data.skills, { name: "Nova skill", stat: "INT", level: 0 }])
                }
              >
                Nova skill
              </Button>
              <Button size="sm" onClick={addDefaultSkills}>
                Acrescentar as skills do jogo
              </Button>
            </div>
          )}

          <h4 className="p-strip">Armas</h4>
          <div className="p-table">
            <div className="p-row p-head weapons">
              <span className="grow">Arma</span>
              <span className="w-skill">Skill</span>
              <span className="w-dmg">Dano</span>
              <span className="w-rof">ROF</span>
              <span className="w-ammo">Munição</span>
              <span className="w-notes">Notas</span>
              <span className="p-actions" />
            </div>
            {data.weapons.map((weapon, i) => {
              const update = (change: Partial<typeof weapon>) =>
                edit(
                  "weapons",
                  data.weapons.map((w, j) => (j === i ? { ...w, ...change } : w)),
                );
              const attack = attackTotal(weapon.skill);
              // A skill foi apagada da ficha: a arma fica em erro até escolher outra.
              const missingSkill = weapon.skill !== "" && !skillNames.includes(weapon.skill);
              return (
                <div className={`p-row weapons${missingSkill ? " invalid" : ""}`} key={i}>
                  <span className="p-cell grow w-name">
                    <input
                      aria-label="Arma"
                      placeholder="Arma"
                      value={weapon.name}
                      maxLength={40}
                      disabled={ro}
                      onChange={(e) => update({ name: e.target.value })}
                    />
                  </span>
                  <span className={`p-cell w-skill${missingSkill ? " invalid" : ""}`}>
                    <select
                      aria-label="Skill da arma"
                      aria-invalid={missingSkill || undefined}
                      value={missingSkill ? "" : weapon.skill}
                      disabled={ro}
                      onChange={(e) => update({ skill: e.target.value })}
                    >
                      <option value="">Escolher skill</option>
                      {skillNames.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </span>
                  <span className="p-cell w-dmg mono">
                    <input
                      aria-label="Dano"
                      value={weapon.damage}
                      maxLength={30}
                      placeholder="3d6"
                      disabled={ro}
                      onChange={(e) => update({ damage: e.target.value })}
                    />
                  </span>
                  <span className="p-cell w-rof mono">
                    <input
                      aria-label="ROF"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={10}
                      step={1}
                      value={weapon.rof}
                      disabled={ro}
                      onChange={(e) => update({ rof: Math.trunc(Number(e.target.value)) || 0 })}
                    />
                  </span>
                  <span className="p-cell w-ammo mono ammo">
                    <input
                      aria-label="Munição"
                      type="number"
                      min={0}
                      max={999}
                      value={weapon.ammo}
                      disabled={ro}
                      onChange={(e) => update({ ammo: Math.trunc(Number(e.target.value)) || 0 })}
                    />
                    <span>/</span>
                    <input
                      aria-label="Carregador"
                      type="number"
                      min={0}
                      max={999}
                      value={weapon.ammoMax}
                      disabled={ro}
                      onChange={(e) => update({ ammoMax: Math.trunc(Number(e.target.value)) || 0 })}
                    />
                  </span>
                  <span className="p-cell w-notes">
                    <input
                      aria-label="Notas da arma"
                      placeholder="Notas"
                      value={weapon.notes}
                      maxLength={CHARACTER_LIMITS.textShort}
                      disabled={ro}
                      onChange={(e) => update({ notes: e.target.value })}
                    />
                  </span>
                  <span className="p-actions">
                    <IconButton
                      icon="dice"
                      size="sm"
                      variant="ghost"
                      label={`Atacar com ${weapon.name || "arma"}${attack === null ? " (skill não encontrada: +0)" : ` (+${attack})`}`}
                      onClick={() => roll(checkExpression(attack ?? 0), `Ataque: ${weapon.name}`)}
                    />
                    <IconButton
                      icon="heart"
                      size="sm"
                      variant="ghost"
                      label={`Rolar dano de ${weapon.name || "arma"}`}
                      disabled={!weapon.damage}
                      onClick={() => roll(weapon.damage, `Dano: ${weapon.name}`)}
                    />
                    {!ro && (
                      <IconButton
                        icon="trash"
                        size="sm"
                        variant="ghost"
                        label={`Tirar ${weapon.name || "arma"}`}
                        onClick={() => removeAt("weapons", i)}
                      />
                    )}
                  </span>
                  {missingSkill && (
                    <span className="p-error" role="alert">
                      Escolha uma skill da ficha.
                    </span>
                  )}
                </div>
              );
            })}
            {Array.from({ length: Math.max(0, 2 - data.weapons.length) }, (_, n) => (
              <div className="p-row blank" key={`b${n}`} aria-hidden="true" />
            ))}
          </div>
          {!ro && (
            <div className="p-add">
              <Button
                size="sm"
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
          )}

          <h4 className="p-strip">Equipamento</h4>
          <div className="p-table">
            <div className="p-row p-head gear">
              <span className="grow">Item</span>
              <span className="w-qty">Qtd.</span>
              <span className="p-actions" />
            </div>
            {data.gear.map((item, i) => {
              const update = (change: Partial<typeof item>) =>
                edit(
                  "gear",
                  data.gear.map((g, j) => (j === i ? { ...g, ...change } : g)),
                );
              return (
                <div className="p-row gear" key={i}>
                  <span className="p-cell grow">
                    <input
                      aria-label="Item"
                      value={item.name}
                      maxLength={40}
                      disabled={ro}
                      onChange={(e) => update({ name: e.target.value })}
                    />
                  </span>
                  <span className="p-cell w-qty mono">
                    <input
                      aria-label="Quantidade"
                      type="number"
                      min={0}
                      max={9999}
                      value={item.qty}
                      disabled={ro}
                      onChange={(e) => update({ qty: Math.trunc(Number(e.target.value)) || 0 })}
                    />
                  </span>
                  <span className="p-actions">
                    {!ro && (
                      <IconButton
                        icon="trash"
                        size="sm"
                        variant="ghost"
                        label={`Tirar ${item.name || "item"}`}
                        onClick={() => removeAt("gear", i)}
                      />
                    )}
                  </span>
                </div>
              );
            })}
            {Array.from({ length: Math.max(0, 2 - data.gear.length) }, (_, n) => (
              <div className="p-row blank" key={`b${n}`} aria-hidden="true" />
            ))}
            <div className="p-row p-sum">
              <span className="grow t-label">Eurodólares</span>
              <span className="p-cell w-eddies mono">
                <input
                  aria-label="Eurodólares"
                  type="number"
                  min={0}
                  max={99_999_999}
                  value={data.eddies}
                  disabled={ro}
                  onChange={(e) => edit("eddies", Math.trunc(Number(e.target.value)) || 0)}
                />
              </span>
              <span className="p-actions" />
            </div>
          </div>
          {!ro && (
            <div className="p-add">
              <Button
                size="sm"
                icon="plus"
                onClick={() =>
                  edit("gear", [...data.gear, { name: "Novo item", qty: 1, notes: "" }])
                }
              >
                Novo item
              </Button>
            </div>
          )}
        </div>
      </div>

      <h4 className="p-strip">História e notas</h4>
      <div className="p-grid story">
        <Box label="Lifepath" area>
          <textarea
            rows={6}
            maxLength={CHARACTER_LIMITS.textLong}
            value={data.lifepath}
            disabled={ro}
            onChange={(e) => edit("lifepath", e.target.value)}
          />
        </Box>
        <Box label="Notas" area>
          <textarea
            rows={6}
            maxLength={CHARACTER_LIMITS.textLong}
            value={data.notes}
            disabled={ro}
            onChange={(e) => edit("notes", e.target.value)}
          />
        </Box>
      </div>
      {ro && (
        <p className="details p-foot">
          Somente leitura: outra pessoa edita ou é a ficha de outro jogador.
        </p>
      )}
      {!ro && <p className="details p-foot">Salva sozinha a cada mudança.</p>}
      <ErrorText>{message}</ErrorText>
    </div>
  );
}

function NumInput({
  value,
  min,
  max,
  disabled,
  onValue,
}: {
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  onValue: (n: number) => void;
}) {
  return (
    <input
      type="number"
      min={min}
      max={max}
      value={value}
      disabled={disabled}
      onChange={(e) => onValue(Math.trunc(Number(e.target.value)) || 0)}
    />
  );
}

/** Campo-caixa da folha: o rótulo fica impresso dentro, o valor embaixo. */
function Box({
  label,
  suffix,
  error,
  className = "",
  big,
  area,
  readOnly,
  children,
}: {
  label: string;
  suffix?: string;
  error?: string;
  className?: string;
  big?: boolean;
  area?: boolean;
  readOnly?: boolean;
  children: ReactNode;
}) {
  return (
    <label
      className={`p-box ${className} ${big ? "big" : ""} ${area ? "area" : ""} ${error ? "error" : ""} ${readOnly ? "static" : ""}`}
    >
      <span className="t-label">{label}</span>
      <span className="p-box-in">
        {children}
        {suffix && <span className="p-suffix">{suffix}</span>}
      </span>
      {error && (
        <span className="field-msg" role="alert">
          <Icon name="alert" size={14} />
          {error}
        </span>
      )}
    </label>
  );
}
