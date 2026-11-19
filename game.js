const MAX_ENERGY = 5;
const INITIAL_PLAYER_HP = 100;
const INITIAL_ENEMY_HP = 110;

const STANDS = {
  glass: {
    name: "玻璃の拳士",
    type: "響",
    ability: "意志を拳に刻む",
    strikeName: "砕晶連打",
    strikeDescription: "拳の連打で攻め、共鳴 +1",
    specialName: "硝子星穿ち",
    specialDescription: "意志を一点に集中した必殺技",
    strikeDamage: [14, 21],
    specialDamage: [29, 38],
    damageTaken: 1,
  },
  storm: {
    name: "雷鎖のヴァルカン",
    type: "電",
    ability: "稲妻を鎖に変える",
    strikeName: "紫電追撃",
    strikeDescription: "電光石火の連撃。共鳴 +1",
    specialName: "雷鎖・八方穿ち",
    specialDescription: "雷鎖を放ち、敵を貫く",
    strikeDamage: [12, 19],
    specialDamage: [27, 35],
    damageTaken: 0.82,
  },
  star: {
    name: "星喰いのアルカ",
    type: "星",
    ability: "重力を一点に圧縮する",
    strikeName: "星砕き",
    strikeDescription: "重い一撃で攻め、共鳴 +1",
    specialName: "天墜・星喰らい",
    specialDescription: "重力を解放する高威力の必殺技",
    strikeDamage: [17, 24],
    specialDamage: [36, 46],
    damageTaken: 1.15,
  },
};

let selectedStand = "glass";

const state = {
  playerHp: INITIAL_PLAYER_HP,
  enemyHp: INITIAL_ENEMY_HP,
  energy: 2,
  guarding: false,
  enemyIntent: null,
  ended: false,
  turn: 1,
};

const elements = {
  playerHpText: document.querySelector("#player-hp-text"),
  playerHpBar: document.querySelector("#player-hp-bar"),
  enemyHpText: document.querySelector("#enemy-hp-text"),
  enemyHpBar: document.querySelector("#enemy-hp-bar"),
  energyText: document.querySelector("#energy-text"),
  energyPips: document.querySelector("#energy-pips"),
  enemyIntent: document.querySelector("#enemy-intent"),
  battleTurn: document.querySelector("#battle-turn"),
  battleMessage: document.querySelector("#battle-message"),
  playerAvatar: document.querySelector("#player-avatar"),
  enemyAvatar: document.querySelector("#enemy-avatar"),
  standName: document.querySelector("#player-stand-name"),
  standAbility: document.querySelector("#player-stand-ability"),
  standType: document.querySelector("#player-stand-type"),
  strikeName: document.querySelector("#strike-name"),
  strikeDescription: document.querySelector("#strike-description"),
  specialName: document.querySelector("#special-name"),
  specialDescription: document.querySelector("#special-description"),
  standOptions: [...document.querySelectorAll("[data-stand]")],
  battleHeading: document.querySelector("#battle-heading"),
  battleLog: document.querySelector("#battle-log"),
  actionButtons: [...document.querySelectorAll("[data-action]")],
  restartButton: document.querySelector("#restart-button"),
};

function currentStand() {
  return STANDS[selectedStand];
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function addLog(message, type = "player-entry") {
  elements.battleMessage.textContent = message;
  const entry = document.createElement("li");
  entry.className = type;
  entry.textContent = message;
  elements.battleLog.prepend(entry);
  while (elements.battleLog.children.length > 6) {
    elements.battleLog.lastElementChild.remove();
  }
}

function animateAvatar(avatar, animation) {
  avatar.classList.remove("hit", "attacking", "guarding");
  void avatar.offsetWidth;
  avatar.classList.add(animation);
  avatar.addEventListener("animationend", () => avatar.classList.remove(animation), { once: true });
}

function updateMeter(textElement, barElement, current, max) {
  textElement.textContent = `${current} / ${max}`;
  barElement.style.width = `${(current / max) * 100}%`;
  const progress = barElement.parentElement;
  progress.setAttribute("aria-valuemax", String(max));
  progress.setAttribute("aria-valuenow", String(current));
}

function render() {
  const stand = currentStand();
  updateMeter(elements.playerHpText, elements.playerHpBar, state.playerHp, INITIAL_PLAYER_HP);
  updateMeter(elements.enemyHpText, elements.enemyHpBar, state.enemyHp, INITIAL_ENEMY_HP);
  elements.standName.textContent = `『${stand.name}』`;
  elements.standAbility.textContent = `異能：${stand.ability}`;
  elements.standType.textContent = stand.type;
  elements.strikeName.textContent = stand.strikeName;
  elements.strikeDescription.textContent = stand.strikeDescription;
  elements.specialName.textContent = stand.specialName;
  elements.specialDescription.textContent = stand.specialDescription;
  elements.playerAvatar.dataset.stand = selectedStand;
  elements.standOptions.forEach((button) => {
    const isSelected = button.dataset.stand === selectedStand;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });
  elements.energyText.textContent = `${state.energy} / ${MAX_ENERGY}`;
  elements.battleTurn.textContent = `TURN ${String(state.turn).padStart(2, "0")}`;
  elements.energyPips.replaceChildren();
  for (let index = 0; index < MAX_ENERGY; index += 1) {
    const pip = document.createElement("span");
    pip.className = index < state.energy ? "energy-pip filled" : "energy-pip";
    pip.setAttribute("aria-hidden", "true");
    elements.energyPips.append(pip);
  }
  elements.energyPips.setAttribute("aria-label", `エネルギー ${state.energy} / ${MAX_ENERGY}`);
  elements.enemyIntent.textContent = state.enemyIntent?.label ?? "敵の動きを読んでいる…";
  elements.actionButtons.forEach((button) => {
    button.disabled = state.ended || (button.dataset.action === "special" && state.energy < 2);
  });
}

function chooseEnemyIntent() {
  state.enemyIntent = Math.random() < 0.62
    ? { label: "予告：環刃の一閃", damage: randomBetween(10, 15) }
    : { label: "予告：重圧領域", damage: randomBetween(20, 27) };
}

function finishBattle(won) {
  state.ended = true;
  state.enemyIntent = null;
  elements.battleHeading.textContent = won ? "勝利！ 意志が道を開いた" : "敗北… ここで終わりではない";
  addLog(
    won ? `朔夜と『虚空の重奏』を打ち破った！ ${currentStand().name}の勝利だ！` : "力尽きてしまった。もう一度挑戦しよう。",
    "result-entry",
  );
}

function enemyTurn() {
  const intent = state.enemyIntent;
  animateAvatar(elements.enemyAvatar, "attacking");
  animateAvatar(elements.playerAvatar, state.guarding ? "guarding" : "hit");
  const adjustedDamage = Math.floor(intent.damage * currentStand().damageTaken);
  const damage = state.guarding ? Math.max(1, Math.floor(adjustedDamage * 0.35)) : adjustedDamage;
  state.playerHp = Math.max(0, state.playerHp - damage);
  addLog(
    state.guarding
      ? `身構えて攻撃を受け流した！ ${damage} ダメージ。`
      : `朔夜の攻撃！ ${damage} ダメージを受けた。`,
    "enemy-entry",
  );
  state.guarding = false;
  if (state.playerHp === 0) {
    finishBattle(false);
    return;
  }
  chooseEnemyIntent();
}

function takeAction(action) {
  if (state.ended) return;
  if (action === "special" && state.energy < 2) return;
  state.turn += 1;

  if (action === "strike") {
    const stand = currentStand();
    const damage = randomBetween(...stand.strikeDamage);
    state.enemyHp = Math.max(0, state.enemyHp - damage);
    state.energy = Math.min(MAX_ENERGY, state.energy + 1);
    animateAvatar(elements.playerAvatar, "attacking");
    animateAvatar(elements.enemyAvatar, "hit");
    addLog(`${stand.name}の${stand.strikeName}！ ${damage} ダメージ。共鳴 +1。`);
  } else if (action === "special") {
    const stand = currentStand();
    const damage = randomBetween(...stand.specialDamage);
    state.energy -= 2;
    state.enemyHp = Math.max(0, state.enemyHp - damage);
    animateAvatar(elements.playerAvatar, "attacking");
    animateAvatar(elements.enemyAvatar, "hit");
    addLog(`${stand.specialName}が炸裂！ ${damage} ダメージ！`);
  } else if (action === "guard") {
    state.guarding = true;
    state.energy = Math.min(MAX_ENERGY, state.energy + 1);
    addLog("具現体と呼吸を合わせて受け流す構えをとった。");
  } else if (action === "focus") {
    const recovered = Math.min(2, MAX_ENERGY - state.energy);
    state.energy += recovered;
    addLog(recovered > 0 ? `精神を研ぎ澄ませた。共鳴 +${recovered}。` : "精神を研ぎ澄ませた。共鳴はすでに最大だ。");
  }

  if (state.enemyHp === 0) {
    finishBattle(true);
  } else {
    enemyTurn();
  }
  render();
}

function restartBattle() {
  state.playerHp = INITIAL_PLAYER_HP;
  state.enemyHp = INITIAL_ENEMY_HP;
  state.energy = 2;
  state.guarding = false;
  state.ended = false;
  state.turn = 1;
  elements.battleLog.replaceChildren();
  elements.battleHeading.textContent = "行動を選べ";
  chooseEnemyIntent();
  addLog("朔夜が立ちはだかる。『虚空の重奏』の気配が空間を歪めた！");
  render();
}

elements.standOptions.forEach((button) => {
  button.addEventListener("click", () => {
    if (!STANDS[button.dataset.stand]) return;
    selectedStand = button.dataset.stand;
    restartBattle();
    addLog(`${currentStand().name}と契約した！ 新たな戦いが始まる。`);
  });
});

elements.actionButtons.forEach((button) => {
  button.addEventListener("click", () => takeAction(button.dataset.action));
});
elements.restartButton.addEventListener("click", restartBattle);

restartBattle();
