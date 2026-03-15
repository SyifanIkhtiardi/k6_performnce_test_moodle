import http from "k6/http";
import { check, sleep } from "k6";
import { SharedArray } from "k6/data";
import { Rate, Trend } from "k6/metrics";

// ============================================================
// CUSTOM METRICS
// ============================================================
const loginSuccessRate = new Rate("login_success_rate");
const examLoadTime     = new Trend("exam_load_time_ms");
const answerSaveTime   = new Trend("answer_save_time_ms");

// ============================================================
// OPTIONS — 1000 Students scenario
// Ramp up → sustained load → ramp down
// ============================================================
export const options = {
  scenarios: {
    exam_load: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "2m",  target: 200  }, // ramp-up  : 0  → 200 VU
        { duration: "5m",  target: 1000 }, // ramp-up  : 200 → 1000 VU
        { duration: "10m", target: 1000 }, // sustained: hold 1000 VU
        { duration: "3m",  target: 0    }, // ramp-down: 1000 → 0 VU
      ],
    },
  },
  thresholds: {
    http_req_failed:        ["rate<0.01"],          // Error rate < 1%
    http_req_duration:      ["p(95)<4000"],         // 95th percentile < 4s
    login_success_rate:     ["rate>0.99"],           // Login success > 99%
    exam_load_time_ms:      ["p(90)<3000"],         // Quiz load < 3s (p90)
    answer_save_time_ms:    ["p(95)<2000"],         // Save answer < 2s (p95)
  },
};

// ============================================================
// CONFIG
// ============================================================
const BASE_URL = "https://ujian.smkn7semarang.sch.id";
const QUIZ_ID  = 2271;

// ============================================================
// DATA
// ============================================================
const users = new SharedArray("users", () =>
  JSON.parse(open("../data/users.json"))
);

const answersData = JSON.parse(open("../data/answers.json")).questions;

// ============================================================
// HELPERS
// ============================================================
/**
 * Assign each VU a unique user from the pool (wraps around if needed).
 */
function getUser() {
  return users[(__VU - 1) % users.length];
}

/**
 * Pick a random answer from available options for a question.
 */
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ============================================================
// STEP 1 — LOGIN & START ATTEMPT
// ============================================================
function loginAndStart() {
  const user = getUser();

  // GET login page to retrieve CSRF logintoken
  const loginPage = http.get(`${BASE_URL}/login/index.php`);
  const token = loginPage.html().find("input[name=logintoken]").val();

  // POST credentials
  const loginRes = http.post(`${BASE_URL}/login/index.php`, {
    username:   user.username,
    password:   user.password,
    logintoken: token,
  });

  loginSuccessRate.add(loginRes.status === 200);

  // GET quiz page, extract sesskey
  const quizPage  = http.get(`${BASE_URL}/mod/quiz/view.php?id=${QUIZ_ID}`);
  const sesskey   = quizPage.html().find("input[name=sesskey]").val();

  const start = http.post(
    `${BASE_URL}/mod/quiz/startattempt.php`,
    { cmid: QUIZ_ID, sesskey },
    { redirects: 0 }
  );

  const attemptPageRes = http.get(start.headers["Location"]);
  examLoadTime.add(attemptPageRes.timings.duration);

  return {
    attemptId: attemptPageRes.html().find("input[name=attempt]").val(),
    sesskey:   attemptPageRes.html().find("input[name=sesskey]").val(),
  };
}

// ============================================================
// STEP 2 — PARSE QUESTION ON EACH PAGE
// ============================================================
function parseQuestion(page) {
  const radio = page.html()
    .find('input[type=radio][name$="_answer"]')
    .toArray()[0];

  const name = radio.attr("name");
  const seq  = name.replace("_answer", "_:sequencecheck");

  return { name, seq };
}

// ============================================================
// STEP 3 — ANSWER A SINGLE PAGE & NAVIGATE NEXT
// ============================================================
function answerPage(session, pageIndex) {
  const page = http.get(
    `${BASE_URL}/mod/quiz/attempt.php?attempt=${session.attemptId}&page=${pageIndex}`
  );

  const q = parseQuestion(page);

  const payload = {
    attempt:   session.attemptId,
    sesskey:   session.sesskey,
    thispage:  pageIndex,
    next:      "Next page",
    [q.name]:  pickRandom(answersData[pageIndex]),
    [q.seq]:   1,
  };

  const res = http.post(`${BASE_URL}/mod/quiz/processattempt.php`, payload);
  answerSaveTime.add(res.timings.duration);

  check(res, {
    [`page ${pageIndex} saved (200)`]: (r) => r.status === 200,
  });
}

// ============================================================
// STEP 4 — FINISH & SUBMIT ATTEMPT
// ============================================================
function finishAttempt(session, lastPage) {
  const payload = {
    attempt:        session.attemptId,
    sesskey:        session.sesskey,
    thispage:       lastPage,
    next:           "Finish attempt",
    finishattempt:  1,
    timeup:         0,
  };

  const res = http.post(`${BASE_URL}/mod/quiz/processattempt.php`, payload);

  check(res, {
    "attempt finished (200)": (r) => r.status === 200,
  });
}

// ============================================================
// MAIN FUNCTION
// ============================================================
export default function () {
  const session     = loginAndStart();
  sleep(1);

  const TOTAL_PAGES = answersData.length;

  for (let i = 0; i < TOTAL_PAGES; i++) {
    answerPage(session, i);
    sleep(0.5);
  }

  finishAttempt(session, TOTAL_PAGES - 1);
}
