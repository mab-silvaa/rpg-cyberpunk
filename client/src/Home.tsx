import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  type CharacterData,
  type CharacterReply,
  type CharacterView,
  type ClientToServerEvents,
  maxHp,
  type FogState,
  type InitiativeView,
  type PresenceUser,
  type RollReply,
  type RollRequest,
  type RollResult,
  type RulerLine,
  type RulerState,
  type SceneSummary,
  type SceneView,
  type ServerToClientEvents,
  type TokenMove,
  type TokenView,
  type TunnelInfo,
  type User,
} from "@vtt/shared";
import { api } from "./api";
import { DiceBar, useDice } from "./DicePanel";
import { GmPanel } from "./GmPanel";
import { Icon } from "./icons";
import { InitiativeBar } from "./InitiativePanel";
import { MapView } from "./MapView";
import { PLAYER_TABS, PlayerContent, PlayerTabs, type PlayerTab } from "./PlayerPanel";
import { Vital } from "./CharacterSheet";
import { RenameDialog } from "./Rename";
import { Alert, Badge, Button, IconButton, MoreMenu, useToast, type MenuItem } from "./ui";

/** Celular em pé: tela estreita, onde mexer no mapa seria impreciso. */
function useNarrowScreen(): boolean {
  const query = "(max-width: 700px)";
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setNarrow(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return narrow;
}

type Status = "conectando" | "conectado" | "desconectado";
type VttSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function Home({ user: sessionUser, onLogout }: { user: User; onLogout: () => void }) {
  const [status, setStatus] = useState<Status>("conectando");
  const narrow = useNarrowScreen();
  const [players, setPlayers] = useState<PresenceUser[]>([]);
  const [renaming, setRenaming] = useState(false);
  // O nome muda ao vivo pela lista de presença (renomeio próprio ou feito pelo mestre).
  const liveName = players.find((p) => p.id === sessionUser.id)?.name;
  const user = useMemo<User>(
    () =>
      liveName && liveName !== sessionUser.name ? { ...sessionUser, name: liveName } : sessionUser,
    [sessionUser, liveName],
  );
  const socketRef = useRef<VttSocket>(null);
  const [activeScene, setActiveScene] = useState<SceneView | null>(null);
  const [rulers, setRulers] = useState<RulerState[]>([]);
  // Mestre: tokens de todas as cenas. Jogador: só os visíveis da cena ativa.
  const [tokens, setTokens] = useState<TokenView[]>([]);
  const [characters, setCharacters] = useState<CharacterView[]>([]);
  const [initiative, setInitiative] = useState<InitiativeView>({
    round: 0,
    activeId: null,
    entries: [],
  });
  const [rolls, setRolls] = useState<RollResult[]>([]);
  const [fogs, setFogs] = useState<Record<number, FogState>>({});
  const [selectedTokenId, setSelectedTokenId] = useState<number | null>(null);
  // Só o mestre: lista de cenas e a cena que ele está olhando em prévia.
  const [scenes, setScenes] = useState<SceneSummary[]>([]);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [playerTab, setPlayerTab] = useState<PlayerTab>(narrow ? "mapa" : "dados");
  const [tunnel, setTunnel] = useState<TunnelInfo>();
  const { toast, show } = useToast();

  useEffect(() => {
    const s: VttSocket = io();
    s.on("connect", () => setStatus("conectado"));
    s.on("disconnect", (reason) => {
      setStatus("desconectado");
      // O servidor fechou a conexão de propósito (por exemplo, o mestre expulsou este jogador).
      // Se a sessão não vale mais, volta para a entrada.
      if (reason === "io server disconnect") api.me().catch(onLogout);
    });
    s.on("connect_error", (error) => {
      if (error.message === "unauthorized") onLogout();
    });
    s.on("presence:update", setPlayers);
    s.on("state:snapshot", (snapshot) => {
      setActiveScene(snapshot.scene);
      setRulers(snapshot.rulers);
      setTokens(snapshot.tokens);
      setFogs(Object.fromEntries(snapshot.fogs.map((f) => [f.sceneId, f])));
      setRolls(snapshot.rolls);
      setCharacters(snapshot.characters);
      setInitiative(snapshot.initiative);
    });
    s.on("initiative:set", setInitiative);
    s.on("character:update", (c) => setCharacters((current) => upsertCharacter(current, c)));
    s.on("character:remove", (id) =>
      setCharacters((current) => current.filter((c) => c.id !== id)),
    );
    s.on("dice:result", (roll) => setRolls((current) => addRoll(current, roll)));
    s.on("fog:set", (fog) => setFogs((current) => ({ ...current, [fog.sceneId]: fog })));
    s.on("fog:add", (sceneId, shape) =>
      setFogs((current) => {
        const fog = current[sceneId];
        if (!fog || fog.shapes.some((x) => x.id === shape.id)) return current;
        return { ...current, [sceneId]: { ...fog, shapes: [...fog.shapes, shape] } };
      }),
    );
    s.on("tokens:set", setTokens);
    s.on("token:upsert", (token) => setTokens((current) => upsertToken(current, token)));
    s.on("token:remove", (id) => setTokens((current) => current.filter((t) => t.id !== id)));
    s.on("token:move", (id, x, y) =>
      setTokens((current) => current.map((t) => (t.id === id ? { ...t, x, y } : t))),
    );
    s.on("scene:update", (scene) => {
      setActiveScene(scene);
      setRulers([]);
    });
    s.on("ruler:update", (userId, ruler) => {
      setRulers((current) => {
        const others = current.filter((r) => r.userId !== userId);
        return ruler ? [...others, ruler] : others;
      });
    });
    socketRef.current = s;
    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, [onLogout]);

  useEffect(() => {
    if (user.isGm) void api.scenes().then(setScenes, () => undefined);
  }, [user.isGm]);

  const sendRuler = useCallback(
    (line: RulerLine | null) => socketRef.current?.emit("ruler:update", line),
    [],
  );

  const sendTokenMove = useCallback((move: TokenMove) => {
    socketRef.current?.emit("token:move", move);
    // Ao soltar, a posição fica valendo aqui na hora; se o servidor recusar, ele corrige.
    if (move.final) {
      setTokens((current) =>
        current.map((t) => (t.id === move.id ? { ...t, x: move.x, y: move.y } : t)),
      );
    }
  }, []);
  const rollDice = useCallback(
    (request: RollRequest) =>
      new Promise<RollReply>((resolve) => {
        const socket = socketRef.current;
        if (!socket?.connected) {
          return resolve({ ok: false, error: "Sem conexão com a mesa. Espere reconectar" });
        }
        socket.emit("dice:roll", request, (reply) => {
          if (reply.ok) setRolls((current) => addRoll(current, reply.roll));
          resolve(reply);
        });
      }),
    [],
  );
  const saveCharacter = useCallback(
    (id: number, patch: Partial<CharacterData>) =>
      new Promise<CharacterReply>((resolve) => {
        const socket = socketRef.current;
        if (!socket?.connected) {
          return resolve({ ok: false, error: "Sem conexão com a mesa. Vou tentar de novo" });
        }
        socket.emit("character:patch", id, patch, (reply) => {
          if (reply.ok) setCharacters((current) => upsertCharacter(current, reply.character));
          resolve(reply);
        });
      }),
    [],
  );
  const addCharacter = useCallback(
    (c: CharacterView) => setCharacters((current) => upsertCharacter(current, c)),
    [],
  );
  const removeCharacter = useCallback(
    (id: number) => setCharacters((current) => current.filter((c) => c.id !== id)),
    [],
  );
  const changeToken = useCallback(
    (token: TokenView) => setTokens((current) => upsertToken(current, token)),
    [],
  );
  const removeToken = useCallback(
    (id: number) => setTokens((current) => current.filter((t) => t.id !== id)),
    [],
  );

  const preview = useMemo(
    () => (previewId === null ? undefined : scenes.find((s) => s.id === previewId)),
    [previewId, scenes],
  );
  const shown = preview ?? activeScene;
  const shownFog = shown ? (fogs[shown.id] ?? null) : null;
  const shownTokens = useMemo(
    () => (shown ? tokens.filter((t) => t.sceneId === shown.id) : []),
    [tokens, shown],
  );

  async function leave() {
    await api.logout();
    onLogout();
  }

  const userMenu: MenuItem[] = [
    { label: "Mudar meu nome", icon: "note", onSelect: () => setRenaming(true) },
    { label: "Sair", icon: "logout", danger: true, onSelect: () => void leave() },
  ];
  const renameDialog = renaming ? (
    <RenameDialog
      name={user.name}
      onSave={async (name) => void (await api.rename(user.id, name))}
      onClose={() => setRenaming(false)}
    />
  ) : null;

  useEffect(() => {
    if (!user.isGm) return;
    void api
      .tunnel()
      .then(setTunnel, () => setTunnel({ url: null, error: "Falha ao ler o tunnel" }));
  }, [user.isGm]);

  async function copyLink() {
    if (!tunnel?.url) return;
    try {
      await navigator.clipboard.writeText(tunnel.url);
      show("Link copiado. Cole no Discord.");
    } catch {
      show("Não consegui copiar. Selecione o link e copie à mão.");
    }
  }

  const dice = useDice(rollDice, user.isGm);

  const outsideActive = preview !== undefined && preview.id !== activeScene?.id;
  const activeEntry = initiative.entries.find((e) => e.id === initiative.activeId);
  const turnTokenId = activeEntry?.tokenId ?? null;
  const myCharacter = characters.find((c) => c.ownerId === user.id);
  const isMyTurn =
    !user.isGm &&
    activeEntry !== undefined &&
    ((turnTokenId !== null && tokens.some((t) => t.id === turnTokenId && t.ownerId === user.id)) ||
      activeEntry.name === user.name ||
      (myCharacter !== undefined && activeEntry.name === myCharacter.data.handle));
  const hasInitiative = initiative.entries.length > 0 || initiative.round > 0;

  const connection = (
    <span
      className={`conn ${status === "conectado" ? "ok" : status === "desconectado" ? "lost" : "wait"}`}
      role="status"
    >
      {status === "conectado" ? (
        <span className="dot" aria-hidden="true" />
      ) : (
        <Icon name={status === "desconectado" ? "alert" : "refresh"} size={14} />
      )}
      {status === "conectado"
        ? "Conectado"
        : status === "desconectado"
          ? "Sem conexão"
          : "Reconectando"}
    </span>
  );

  const map = (
    <MapView
      viewOnly={narrow}
      scene={shown}
      preview={outsideActive}
      // Na prévia as réguas da cena ativa não fazem sentido, e a régua do mestre não deve vazar.
      rulers={outsideActive ? [] : rulers}
      isGm={user.isGm}
      selfId={user.id}
      tokens={shownTokens}
      fog={shownFog}
      onFogShape={(shape) => {
        if (shown) void api.addFogShape(shown.id, shape).catch(() => undefined);
      }}
      selectedTokenId={selectedTokenId}
      onSelectToken={user.isGm ? setSelectedTokenId : noSelect}
      onMoveToken={sendTokenMove}
      onRuler={outsideActive ? noRuler : sendRuler}
      onLeavePreview={() => setPreviewId(null)}
      turnTokenId={turnTokenId}
      hasInitiativeBar={hasInitiative && !narrow}
    />
  );

  const playerProps = {
    user,
    players,
    characters,
    initiative,
    rolls,
    dice,
    onSaveCharacter: saveCharacter,
    onRoll: rollDice,
    onCharacterCreated: addCharacter,
    onCharacterRemoved: removeCharacter,
  };

  // Celular do jogador: mapa em cima, conteúdo no meio, quatro destinos embaixo.
  if (narrow && !user.isGm) {
    return (
      <div className="m-table">
        <header className="m-top">
          <span className="logo-mark" />
          <h1 className="logo-name">Salandra</h1>
          <span className="grow" />
          {connection}
          <MoreMenu label="Menu do usuário" triggerText={user.name} items={userMenu} />
        </header>
        {status === "desconectado" && <Alert tone="danger">Conexão perdida. Reconectando…</Alert>}
        {isMyTurn && (
          <div className="turn-strip" role="status">
            <Icon name="play" size={18} />
            Sua vez, {user.name}
            <span className="mono">RODADA {initiative.round}</span>
          </div>
        )}
        <div className="m-map">{map}</div>
        {myCharacter && (
          <div className="m-vitals">
            <div style={{ width: 56 }}>
              <div className="t-label" style={{ fontSize: 10, letterSpacing: "0.14em" }}>
                {(myCharacter.data.handle || "ficha").toUpperCase()}
              </div>
              <div className="t-block" style={{ fontSize: 15, lineHeight: "18px" }}>
                Ficha
              </div>
            </div>
            <Vital
              icon="heart"
              label="HP"
              value={myCharacter.data.hpCurrent}
              max={maxHp(myCharacter.data)}
              tone="ok"
            />
            <Vital
              icon="shield"
              label="SP"
              value={myCharacter.data.bodySp}
              max={myCharacter.data.bodySpMax}
              tone="accent"
            />
          </div>
        )}
        <div className="m-content" role="tabpanel">
          <PlayerContent {...playerProps} tab={playerTab} mobile />
        </div>
        <nav className="m-nav" aria-label="Mesa">
          {PLAYER_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              className="tab"
              aria-selected={playerTab === t.key}
              onClick={() => setPlayerTab(t.key)}
            >
              <Icon name={t.icon} size={22} />
              {t.label}
            </button>
          ))}
        </nav>
        {toast}
        {renameDialog}
      </div>
    );
  }

  return (
    <div className="table">
      <header className="topbar">
        <div className="logo">
          <span className="logo-mark" />
          <h1 className="logo-name">Salandra</h1>
        </div>
        <span className="sep" />
        <div className="scene-name">
          <Icon name="map" size={18} />
          <span>
            {shown ? `${shown.name} · ${shown.metersPerSquare} m por quadrado` : "Sem cena"}
          </span>
        </div>
        {connection}
        <span className="grow" />
        {user.isGm && tunnel?.url && (
          <Button variant="ghost" size="sm" icon="copy" onClick={() => void copyLink()}>
            Copiar link
          </Button>
        )}
        {user.isGm ? (
          <Badge tone="gm" icon="lock">
            Mestre
          </Badge>
        ) : (
          <Badge tone="accent">Jogador</Badge>
        )}
        {user.isGm ? (
          <>
            <span className="who">{user.name}</span>
            <IconButton
              icon="logout"
              label="Sair"
              variant="ghost"
              size="sm"
              onClick={() => void leave()}
            />
          </>
        ) : (
          <span className="who">
            <MoreMenu label="Menu do usuário" triggerText={user.name} items={userMenu} />
          </span>
        )}
      </header>

      {status === "desconectado" && (
        <div style={{ padding: "8px 16px" }}>
          <Alert tone="danger">
            Conexão perdida. Reconectando… O mapa volta ao estado atual assim que reconectar.
          </Alert>
        </div>
      )}

      <div className="body">
        <div className="stage">
          {map}
          <InitiativeBar initiative={initiative} isGm={user.isGm} />
          {!narrow && <DiceBar dice={dice} isGm={user.isGm} last={rolls.at(-1)} />}
        </div>
        <aside className="side" aria-label={user.isGm ? "Painel do mestre" : "Painel do jogador"}>
          {user.isGm ? (
            <GmPanel
              self={user}
              players={players}
              scenes={scenes}
              onScenes={setScenes}
              previewId={previewId}
              onPreview={setPreviewId}
              shownScene={shown}
              tokens={shownTokens}
              fog={shownFog}
              characters={characters}
              onCharacterCreated={addCharacter}
              onCharacterRemoved={removeCharacter}
              onSaveCharacter={saveCharacter}
              onRoll={rollDice}
              rolls={rolls}
              dice={dice}
              initiative={initiative}
              selectedTokenId={selectedTokenId}
              onSelectToken={setSelectedTokenId}
              onTokenChange={changeToken}
              onTokenRemove={removeToken}
              tunnel={tunnel}
              onCopyLink={() => void copyLink()}
            />
          ) : (
            <>
              <PlayerTabs
                active={playerTab === "mapa" ? "dados" : playerTab}
                onChange={setPlayerTab}
                tabs={PLAYER_TABS.filter((t) => t.key !== "mapa")}
              />
              <div className="side-scroll" role="tabpanel">
                <PlayerContent
                  {...playerProps}
                  tab={playerTab === "mapa" ? "dados" : playerTab}
                  mobile={false}
                />
              </div>
            </>
          )}
        </aside>
      </div>
      {toast}
      {renameDialog}
    </div>
  );
}

const noRuler = (): void => undefined;
const noSelect = (): void => undefined;

function upsertCharacter(list: CharacterView[], c: CharacterView): CharacterView[] {
  return list.some((x) => x.id === c.id) ? list.map((x) => (x.id === c.id ? c : x)) : [...list, c];
}

/** Acrescenta a rolagem ao histórico (sem repetir) e mantém só as últimas 100. */
function addRoll(list: RollResult[], roll: RollResult): RollResult[] {
  if (list.some((r) => r.id === roll.id)) return list;
  return [...list, roll].slice(-100);
}

function upsertToken(list: TokenView[], token: TokenView): TokenView[] {
  return list.some((t) => t.id === token.id)
    ? list.map((t) => (t.id === token.id ? token : t))
    : [...list, token];
}
