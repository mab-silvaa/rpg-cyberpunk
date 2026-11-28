import { useEffect, useRef } from "react";
import { initials, type CharacterView, type TokenCondition, type TokenView } from "@vtt/shared";
import { Vital } from "./CharacterSheet";
import { Badge, Button, Card, IconButton } from "./ui";

const CONDITION_LABEL: Record<TokenCondition, string> = {
  standing: "Em pé",
  hurt: "Ferido",
  down: "Caído",
};

/** Miniatura do token: círculo (jogador) ou hexágono (NPC), com o anel hostil e o X de derrotado. */
function Thumb({ token }: { token: TokenView }) {
  const npc = token.ownerId === null;
  const fill = token.defeated ? "var(--surface-3)" : token.color;
  const hex = Array.from({ length: 6 }, (_, i) => {
    const a = Math.PI / 6 + (i * Math.PI) / 3;
    return `${24 + 15 * Math.cos(a)},${24 + 15 * Math.sin(a)}`;
  }).join(" ");
  return (
    <svg width={48} height={48} viewBox="0 0 48 48" aria-hidden="true" style={{ flex: "none" }}>
      {token.hostile && (
        <circle
          cx={24}
          cy={24}
          r={21}
          fill="none"
          stroke={token.defeated ? "var(--text-dim)" : "var(--danger)"}
          strokeWidth={2}
          strokeDasharray={token.defeated ? "4 3" : undefined}
        />
      )}
      {npc ? (
        <polygon points={hex} fill={fill} stroke="var(--bg)" strokeWidth={2} />
      ) : (
        <circle cx={24} cy={24} r={15} fill={fill} stroke="var(--bg)" strokeWidth={2} />
      )}
      {token.defeated ? (
        <path
          d="M18 18l12 12M30 18L18 30"
          stroke="var(--text-dim)"
          strokeWidth={2}
          strokeLinecap="round"
        />
      ) : (
        <text
          x={24}
          y={24}
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="Chakra Petch, sans-serif"
          fontWeight={700}
          fontSize={13}
          fill="var(--bg)"
        >
          {initials(token.name)}
        </text>
      )}
    </svg>
  );
}

/**
 * Cartão rápido do token no celular (prancha 15, visão do jogador). Mostra só o que o papel de
 * quem toca pode ver: o dono vê os números e abre a ficha; os outros veem o estado em palavras;
 * token hostil mostra "Hostil" sem números; derrotado só informa.
 */
export function TokenCard({
  token,
  selfId,
  myCharacter,
  onOpenSheet,
  onClose,
}: {
  token: TokenView;
  selfId: number;
  /** Ficha do próprio jogador, para a armadura (SP) do seu token. */
  myCharacter: CharacterView | undefined;
  onOpenSheet: () => void;
  onClose: () => void;
}) {
  const mine = token.ownerId === selfId;
  const isPlayerToken = token.ownerId !== null;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("button")?.focus();
  }, [token.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const state = token.defeated ? null : token.condition;
  const noSheet = token.characterId === null && !token.hostile;
  const numbers = mine && token.hp !== null && token.hp.max > 0 && !token.defeated;

  return (
    <div className="token-card" role="dialog" aria-label={`Token ${token.name}`} ref={ref}>
      <Card className="token-card-in">
        <div className="token-card-grab" aria-hidden="true" />
        <div className="token-card-head">
          <Thumb token={token} />
          <div className="token-card-id">
            <h2 className="token-card-name">{token.name}</h2>
            <div className="token-card-badges">
              {token.defeated && <Badge tone="danger">Derrotado</Badge>}
              {mine && <Badge tone="accent">Você</Badge>}
              {token.hostile && <Badge tone="danger">Hostil</Badge>}
              {noSheet && !token.defeated && <Badge>Sem ficha</Badge>}
              <Badge tone={isPlayerToken ? "muted" : "gm"}>
                {isPlayerToken ? "Jogador" : "NPC"}
              </Badge>
            </div>
          </div>
          <IconButton icon="x" label="Fechar" variant="ghost" onClick={onClose} />
        </div>
        {numbers && token.hp && (
          <div className="token-card-stats">
            <Vital icon="heart" label="HP" value={token.hp.current} max={token.hp.max} tone="ok" />
            {myCharacter &&
              myCharacter.id === token.characterId &&
              myCharacter.data.bodySpMax > 0 && (
                <Vital
                  icon="shield"
                  label="SP"
                  value={myCharacter.data.bodySp}
                  max={myCharacter.data.bodySpMax}
                  tone="accent"
                />
              )}
          </div>
        )}
        {!numbers && state && (
          <div className="token-card-state">
            <span className="t-label">Estado</span>
            <b>{CONDITION_LABEL[state]}</b>
          </div>
        )}
        {noSheet && !token.defeated && (
          <p className="details">
            {mine
              ? "Este token ainda não tem ficha."
              : "Este token não tem ficha. O mestre pode criar uma."}
          </p>
        )}
        {mine && token.characterId !== null && (
          <Button variant="primary" size="lg" block icon="sheet" onClick={onOpenSheet}>
            Abrir ficha
          </Button>
        )}
        {!mine && isPlayerToken && token.hp !== null && !token.defeated && (
          <p className="details">Só o dono e o mestre veem os números de vida.</p>
        )}
      </Card>
    </div>
  );
}
