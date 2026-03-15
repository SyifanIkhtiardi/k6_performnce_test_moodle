import http from "k6/http";
import { check, sleep } from "k6";
import { SharedArray } from "k6/data";

/* =====================
   OPTIONS
===================== */
export const options = {
  scenarios: {
    exam: {
      executor: "constant-arrival-rate",
      rate: 1,
      timeUnit: "10s",
      duration: "30s",
      preAllocatedVUs: 1,
      maxVUs: 1,
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<4000"],
  },
};

/* =====================
   CONFIG
===================== */
const BASE_URL = "https://ujian.smkn7semarang.sch.id";
const QUIZ_ID = 2271;

/* =====================
   DATA
===================== */
const users = new SharedArray("users", () =>
  JSON.parse(open("./users.json"))
);

const answersData = JSON.parse(open("./answers.json")).questions;

/* =====================
   HELPERS
===================== */
function getUser() {
  return users[(__VU - 1) % users.length];
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/* =====================
   LOGIN + START
===================== */
function loginAndStart() {
  const user = getUser();

  const loginPage = http.get(`${BASE_URL}/login/index.php`);
  const token = loginPage.html()
    .find('input[name=logintoken]')
    .val();

  http.post(`${BASE_URL}/login/index.php`, {
    username: user.username,
    password: user.password,
    logintoken: token,
  });

  const quizPage = http.get(`${BASE_URL}/mod/quiz/view.php?id=${QUIZ_ID}`);
  const sesskey = quizPage.html().find('input[name=sesskey]').val();

  const start = http.post(
    `${BASE_URL}/mod/quiz/startattempt.php`,
    { cmid: QUIZ_ID, sesskey },
    { redirects: 0 }
  );

  const attemptPage = http.get(start.headers["Location"]);

  return {
    attemptId: attemptPage.html().find('input[name=attempt]').val(),
    sesskey: attemptPage.html().find('input[name=sesskey]').val(),
  };
}

/* =====================
   PARSE QUESTION (1 PAGE)
===================== */
function parseQuestion(page) {
  const radio = page.html()
    .find('input[type=radio][name$="_answer"]')
    .toArray()[0];

  const name = radio.attr("name");
  const seq = name.replace("_answer", "_:sequencecheck");

  return { name, seq };
}

/* =====================
   ANSWER PER PAGE
===================== */
function answerPage(session, pageIndex) {
  const page = http.get(
    `${BASE_URL}/mod/quiz/attempt.php?attempt=${session.attemptId}&page=${pageIndex}`
  );

  const q = parseQuestion(page);

  const payload = {
    attempt: session.attemptId,
    sesskey: session.sesskey,
    thispage: pageIndex,
    next: "Next page",
    [q.name]: pickRandom(answersData[pageIndex]),
    [q.seq]: 1,
  };

  const res = http.post(
    `${BASE_URL}/mod/quiz/processattempt.php`,
    payload
  );

  check(res, { [`page ${pageIndex} saved`]: r => r.status === 200 });
}

/* =====================
   FINISH ATTEMPT
===================== */
function finishAttempt(session, lastPage) {
  const payload = {
    attempt: session.attemptId,
    sesskey: session.sesskey,
    thispage: lastPage,
    next: "Finish attempt",
    finishattempt: 1,
    timeup: 0,
  };

  const res = http.post(
    `${BASE_URL}/mod/quiz/processattempt.php`,
    payload
  );

  check(res, { "attempt finished": r => r.status === 200 });
}

/* =====================
   MAIN
===================== */
export default function () {
  const session = loginAndStart();
  sleep(1);

  const TOTAL_PAGES = answersData.length;

  for (let i = 0; i < TOTAL_PAGES; i++) {
    answerPage(session, i);
    sleep(0.5);
  }

  finishAttempt(session, TOTAL_PAGES - 1);
}
