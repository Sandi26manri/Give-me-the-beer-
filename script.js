const ticksGroup = document.getElementById("ticks");
const beer = document.getElementById("beer");
const beerHatch = document.getElementById("beerHatch");
const foamEl = document.getElementById("foam");
const bubblesGroup = document.getElementById("bubbles");
const number = document.getElementById("number");
const hit = document.getElementById("hit");
const handleG = document.getElementById("handleG");
const ring = document.getElementById("ring");
const streamLine = document.getElementById("streamLine");
const hint = document.getElementById("hint");
const nameInput = document.getElementById("nameInput");
const scene = document.getElementById("scene");
const board = document.getElementById("board");
const targetText = document.getElementById("target");
const result = document.getElementById("result");
const resultText = document.getElementById("resultText");
const retry = document.getElementById("retryBtn");
const soundBtn = document.getElementById("soundBtn");
const saveNameBtn = document.getElementById("saveNameBtn");

const SVG_NS = "http://www.w3.org/2000/svg";
const PX = 0.692;
const BOTTOM = 382;     // y of the bottom of the beer inside the glass
const MAX_ML = 500;
const SPEED = 150;
const TARGET = 319;
const MAX_FOAM = 45;      // the most foam (in ml-sized height)
const FOAM_GROW = 0.12;   // foam added per ml poured
const FOAM_FADE = 30;     // foam that disappears every second

// the records board (change these numbers to move or resize it)
const BOARD_X = 272;      // left edge (bigger = more space from the ml numbers)
const BOARD_Y = 40;       // top edge
const BOARD_W = 142;      // width
const BOARD_H = 340;      // height of the ranking box

// make the drawing exactly wide enough for the board
scene.setAttribute("viewBox", "0 -110 " + (BOARD_X + BOARD_W + 8) + " 530");

let ml = 0;
let foam = 0;
let bubbleTimer = 0;
const bubbles = [];
let pouring = false;
let finished = false;
let lastTime = 0;

targetText.textContent = "목표 " + TARGET + " ml";
hint.textContent = "손잡이를 눌러서 따르기 시작!";

function buildTicks() {
  for (let mark = 10; mark <= MAX_ML; mark = mark + 10) {
    const y = BOTTOM - mark * PX;
    const edge = 192 - (y - 30) * (16 / 364) + 3;
    const big = mark % 50 === 0;
    const len = big ? 14 : 7;

    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("class", big ? "tick big" : "tick");
    line.setAttribute("x1", edge);
    line.setAttribute("x2", edge + len);
    line.setAttribute("y1", y);
    line.setAttribute("y2", y);
    ticksGroup.appendChild(line);

    if (big) {
      const label = document.createElementNS(SVG_NS, "text");
      label.setAttribute("class", "tickLabel");
      label.setAttribute("x", edge + len + 5);
      label.setAttribute("y", y + 5);
      label.textContent = mark;
      ticksGroup.appendChild(label);
    }
  }
}
buildTicks();

// ---------- sound ----------
let audio = null;       // the sound machine (made on the first tap)
let noiseGain = null;   // the volume knob of the pouring sound
let soundOn = true;

try {
  if (localStorage.getItem("pourSound") === "off") {
    soundOn = false;
  }
} catch (e) {}

function showSoundButton() {
  soundBtn.textContent = soundOn ? "🔊" : "🔇";
}
showSoundButton();

// phones only allow sound after a touch, so we call this from the first tap
function startAudio() {
  if (audio) {
    if (audio.state === "suspended") {
      audio.resume();
    }
    return;
  }
  try {
    audio = new (window.AudioContext || window.webkitAudioContext)();

    // pouring sound = filtered random noise that loops
    const length = audio.sampleRate * 2;
    const buffer = audio.createBuffer(1, length, audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const filter = audio.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1800;
    filter.Q.value = 0.7;

    noiseGain = audio.createGain();
    noiseGain.gain.value = 0;

    source.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(audio.destination);
    source.start();
  } catch (e) {
    audio = null;
  }
}

function pourSound(on) {
  if (!audio || !noiseGain) {
    return;
  }
  noiseGain.gain.setTargetAtTime(on && soundOn ? 0.12 : 0, audio.currentTime, 0.05);
}

// one short note
function beep(freq, start, duration, type) {
  if (!audio || !soundOn) {
    return;
  }
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type || "square";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.15, audio.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + start + duration);
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start(audio.currentTime + start);
  osc.stop(audio.currentTime + start + duration);
}

function sfxClick() {
  beep(600, 0, 0.05, "square");
}

function sfxGood() {
  [523, 659, 784, 1047].forEach(function (freq, i) {
    beep(freq, i * 0.09, 0.15);
  });
}

function sfxBad() {
  [311, 294, 277].forEach(function (freq, i) {
    beep(freq, i * 0.18, 0.2, "sawtooth");
  });
}

soundBtn.addEventListener("click", function () {
  soundOn = !soundOn;
  showSoundButton();
  if (!soundOn) {
    pourSound(false);
  }
  try {
    localStorage.setItem("pourSound", soundOn ? "on" : "off");
  } catch (e) {}
});

// ---------- name ----------
try {
  nameInput.value = localStorage.getItem("pourName") || "";
} catch (e) {}

saveNameBtn.addEventListener("click", function () {
  const name = nameInput.value.trim();
  try {
    localStorage.setItem("pourName", name);
  } catch (e) {}
  saveNameBtn.textContent = "✓ 저장됨";
  saveNameBtn.classList.add("saved");
  setTimeout(function () {
    saveNameBtn.textContent = "저장";
    saveNameBtn.classList.remove("saved");
  }, 1500);
});

// ---------- shared ranking (Firebase) ----------
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAjeYitx3Uv_BalfQpx2nuDiIMRRln2ga0",
  authDomain: "nunchi-game-test-d2500.firebaseapp.com",
  databaseURL: "https://nunchi-game-test-d2500-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "nunchi-game-test-d2500",
  storageBucket: "nunchi-game-test-d2500.firebasestorage.app",
  messagingSenderId: "122509816",
  appId: "1:122509816:web:4e4fe122671ee6529c9e0d"
};
const DB_PATH = "pourRanking";   // the folder in the database
const SHOW_TOP = 50;             // how many best scores we load
const DAY_START_HOUR = 6;        // a new ranking day starts at 6 am (Seoul time)

let dbTools = null;      // the Firebase functions (loaded in connectRanking)
let db = null;           // the database
let stopListening = null; // stops listening to an old day
let currentDay = "";     // the day we are showing, like 2026-11-24
let records = [];        // the best scores, best first
let myKey = "";          // the id of the score I just sent
let resultBase = "";     // the result text without the rank line

// build the board once: a box with a title and a scrolling list
const box = document.createElementNS(SVG_NS, "foreignObject");
box.setAttribute("x", BOARD_X);
box.setAttribute("y", BOARD_Y);
box.setAttribute("width", BOARD_W);
box.setAttribute("height", BOARD_H);
board.appendChild(box);

const boardBox = document.createElement("div");
boardBox.id = "boardBox";
box.appendChild(boardBox);

const title = document.createElement("div");
title.className = "boardTitle";
title.textContent = "오늘의 랭킹";
boardBox.appendChild(title);

const listEl = document.createElement("div");
listEl.id = "recList";
boardBox.appendChild(listEl);

// show the list; my newest score blinks
function showRecords() {
  listEl.innerHTML = "";
  if (records.length === 0) {
    listEl.textContent = "아직 없어요";
    return;
  }
  records.forEach(function (r, i) {
    const row = document.createElement("div");
    row.className = r.key === myKey ? "recRow new" : "recRow";
    row.textContent = (i + 1) + " " + String(r.name).slice(0, 5) + "  " + r.ml;
    listEl.appendChild(row);
    if (r.key === myKey) {
      listEl.scrollTop = Math.max(0, row.offsetTop - 40);
    }
  });
}

// add my rank to the result text once the list knows my score
function showMyRank() {
  if (!myKey || result.hidden) {
    return;
  }
  const i = records.findIndex(function (r) {
    return r.key === myKey;
  });
  if (i >= 0) {
    resultText.textContent = resultBase + "\n전체 " + (i + 1) + "위!";
  }
}

// today's name, like "2026-11-24" (the day changes at 6 am Seoul time)
function todayKey() {
  const shifted = new Date(Date.now() - DAY_START_HOUR * 60 * 60 * 1000);
  return shifted.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

// listen to today's ranking folder (and stop listening to the old one)
function listenToday() {
  if (!dbTools || !db) {
    return;
  }
  if (stopListening) {
    stopListening();
    stopListening = null;
  }
  currentDay = todayKey();
  records = [];
  myKey = "";
  showRecords();

  const dayRef = dbTools.ref(db, DB_PATH + "/" + currentDay);
  // the best scores: smallest difference first
  const top = dbTools.query(dayRef, dbTools.orderByChild("diff"), dbTools.limitToFirst(SHOW_TOP));
  stopListening = dbTools.onValue(top, function (snapshot) {
    const list = [];
    snapshot.forEach(function (child) {
      const v = child.val();
      list.push({ key: child.key, name: v.name, ml: v.ml, diff: v.diff });
    });
    records = list;
    showRecords();
    showMyRank();
  }, function () {
    listEl.textContent = "랭킹 연결 실패";
  });
}

// connect to Firebase; if it fails the game still works
async function connectRanking() {
  try {
    const appTools = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js");
    dbTools = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js");
    const app = appTools.initializeApp(FIREBASE_CONFIG);
    db = dbTools.getDatabase(app);
    listenToday();
  } catch (e) {
    listEl.textContent = "랭킹 연결 실패";
  }
}

// send my score to today's ranking
function sendRecord(name, shownMl, diff) {
  if (!dbTools || !db) {
    return;
  }
  try {
    const dayRef = dbTools.ref(db, DB_PATH + "/" + currentDay);
    const newRef = dbTools.push(dayRef, {
      name: name,
      ml: shownMl,
      diff: diff,
      t: Date.now()
    });
    myKey = newRef.key;
  } catch (e) {}
}

function setBeer() {
  const h = ml * PX;
  [beer, beerHatch].forEach(function (rect) {
    rect.setAttribute("y", BOTTOM - h);
    rect.setAttribute("height", h);
  });

  // the foam sits on top of the beer
  const foamH = foam * PX;
  foamEl.setAttribute("y", BOTTOM - h - foamH);
  foamEl.setAttribute("height", foamH);
  foamEl.setAttribute("visibility", foam > 0.5 ? "visible" : "hidden");
}

// ---------- bubbles ----------
function spawnBubble() {
  if (ml < 15 || bubbles.length > 40) {
    return;
  }
  const y = BOTTOM - Math.random() * ml * PX * 0.7;
  const left = 56 + (y - 36) * (16 / 346) + 8;
  const right = 184 - (y - 36) * (16 / 346) - 8;

  const circle = document.createElementNS(SVG_NS, "circle");
  circle.setAttribute("r", 2 + Math.random() * 3);
  bubblesGroup.appendChild(circle);

  bubbles.push({
    el: circle,
    x: left + Math.random() * (right - left),
    y: y,
    speed: 28 + Math.random() * 30,
    wobble: Math.random() * 6
  });
}

function moveBubbles(dt) {
  const surface = BOTTOM - ml * PX;
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i];
    b.y = b.y - b.speed * dt;
    b.wobble = b.wobble + dt * 4;
    if (b.y <= surface) {
      b.el.remove();
      bubbles.splice(i, 1);
    } else {
      b.el.setAttribute("cx", b.x + Math.sin(b.wobble) * 3);
      b.el.setAttribute("cy", b.y);
    }
  }
}

function finish() {
  finished = true;
  pouring = false;
  pourSound(false);
  handleG.classList.remove("open");
  streamLine.setAttribute("visibility", "hidden");
  hint.textContent = "거품이 가라앉는 중...";

  const shown = Math.floor(ml);
  const diff = Math.abs(shown - TARGET);

  // wait until the foam has settled, then show the result
  setTimeout(function () {
    showResult(shown, diff);
  }, 1500);
}

function showResult(shown, diff) {
  let rating;
  if (shown >= MAX_ML) { rating = "넘쳤어요! Overflow"; }
  else if (diff <= 1) { rating = "완벽! Perfect!"; }
  else if (diff <= 10) { rating = "좋아요! Nice"; }
  else if (diff <= 30) { rating = "아쉬워요 Close"; }
  else { rating = "너무 달라요! Way off"; }
  let text = rating + "\n" + shown + " ml (목표 " + TARGET + ", 차이 " + diff + ")";

  resultBase = text;
  myKey = "";
  if (shown < MAX_ML) {
    const name = nameInput.value.trim() || "이름없음";
    sendRecord(name, shown, diff);
  }
  resultText.textContent = text;
  result.hidden = false;
  hint.textContent = "";
  showMyRank();

  if (shown < MAX_ML && diff <= 10) {
    sfxGood();
  } else {
    sfxBad();
  }
}

function reset() {
  // if the day changed while the page was open, switch to the new day
  if (dbTools && todayKey() !== currentDay) {
    listenToday();
  }
  ml = 0; foam = 0; pouring = false; finished = false;
  result.hidden = true;
  ring.style.display = "";
  hint.textContent = "손잡이를 눌러서 따르기 시작!";
}

hit.addEventListener("pointerdown", function (e) {
  e.preventDefault();
  startAudio();
  if (finished) { return; }
  pouring = !pouring;
  sfxClick();
  if (pouring) {
    pourSound(true);
    handleG.classList.add("open");
    ring.style.display = "none";
    hint.textContent = TARGET + " ml가 되면 다시 눌러서 멈춰!";
  } else {
    finish();
  }
});
retry.addEventListener("click", reset);

function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  if (pouring) {
    ml = ml + SPEED * dt;
    foam = Math.min(MAX_FOAM, foam + SPEED * FOAM_GROW * dt);
    bubbleTimer = bubbleTimer + dt;
    if (bubbleTimer > 0.06) {
      bubbleTimer = 0;
      spawnBubble();
    }
    if (ml >= MAX_ML) { ml = MAX_ML; pouring = false; finish(); }
  } else {
    foam = Math.max(0, foam - FOAM_FADE * dt);
  }
  moveBubbles(dt);
  setBeer();
  if (pouring) {
    streamLine.setAttribute("y2", BOTTOM - (ml + foam) * PX);
    streamLine.setAttribute("visibility", "visible");
  }
  number.textContent = Math.floor(ml) + " ml";
  requestAnimationFrame(loop);
}
showRecords();
connectRanking();
requestAnimationFrame(loop);
