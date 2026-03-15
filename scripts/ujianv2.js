import http from "k6/http";
import { check, sleep } from "k6";
import { SharedArray } from "k6/data";
import { parseHTML } from "k6/html";
import exec from "k6/execution";

export const options = {
    stages: [
        { duration: '10s', target: 5 }
    ],
    thresholds: {
        http_req_failed: ["rate<0.01"],
    },
};

const BASE_URL = "https://stembapanel.codeplay.id";

const users = new SharedArray("users", () =>
    JSON.parse(open("./users.json"))
);

// Payload DataTable
const DATATABLE_BODY_STATIC = "draw=1&columns%5B0%5D%5Bdata%5D=DT_RowIndex&columns%5B0%5D%5Bname%5D=DT_RowIndex&columns%5B0%5D%5Bsearchable%5D=false&columns%5B0%5D%5Borderable%5D=false&columns%5B0%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B0%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B1%5D%5Bdata%5D=nama&columns%5B1%5D%5Bname%5D=use.nama&columns%5B1%5D%5Bsearchable%5D=true&columns%5B1%5D%5Borderable%5D=true&columns%5B1%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B1%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B2%5D%5Bdata%5D=mapel&columns%5B2%5D%5Bname%5D=mp.nama&columns%5B2%5D%5Bsearchable%5D=true&columns%5B2%5D%5Borderable%5D=true&columns%5B2%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B2%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B3%5D%5Bdata%5D=tanggal_mulai&columns%5B3%5D%5Bname%5D=use.tanggal_mulai&columns%5B3%5D%5Bsearchable%5D=true&columns%5B3%5D%5Borderable%5D=true&columns%5B3%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B3%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B4%5D%5Bdata%5D=tanggal_selesai&columns%5B4%5D%5Bname%5D=use.tanggal_selesai&columns%5B4%5D%5Bsearchable%5D=true&columns%5B4%5D%5Borderable%5D=true&columns%5B4%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B4%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B5%5D%5Bdata%5D=durasi&columns%5B5%5D%5Bname%5D=use.durasi&columns%5B5%5D%5Bsearchable%5D=true&columns%5B5%5D%5Borderable%5D=true&columns%5B5%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B5%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B6%5D%5Bdata%5D=status&columns%5B6%5D%5Bname%5D=&columns%5B6%5D%5Bsearchable%5D=false&columns%5B6%5D%5Borderable%5D=false&columns%5B6%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B6%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B7%5D%5Bdata%5D=action&columns%5B7%5D%5Bname%5D=&columns%5B7%5D%5Bsearchable%5D=false&columns%5B7%5D%5Borderable%5D=false&columns%5B7%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B7%5D%5Bsearch%5D%5Bregex%5D=false&order%5B0%5D%5Bcolumn%5D=0&order%5B0%5D%5Bdir%5D=asc&start=0&length=10&search%5Bvalue%5D=&search%5Bregex%5D=false";

export default function () {
    const currentIterIndex = exec.scenario.iterationInTest;
    const user = users[currentIterIndex % users.length];

    /* ============================
       STEP 1: LOGIN
       ============================ */
    const loginPage = http.get(`${BASE_URL}/login`);
    let csrfToken = parseHTML(loginPage.body).find('input[name="_token"]').val();

    if (!csrfToken) return;

    let loginRes = http.post(`${BASE_URL}/authenticate`, {
        username: user.username,
        password: user.password,
        _token: csrfToken,
    }, {
        headers: {
            'Referer': `${BASE_URL}/login`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36'
        }
    });

    if (loginRes.status !== 200 || loginRes.url.includes('/login')) {
        console.error(`❌ [VU:${__VU}] Login Gagal`);
        return; 
    }

    /* ============================
       STEP 2: LOAD LIST UJIAN
       ============================ */
    
    // 2.a Buka Halaman Wrapper
    const pageUjian = http.get(`${BASE_URL}/siswa/ujian`);
    const docUjian = parseHTML(pageUjian.body);
    let tokenUjian = docUjian.find('input[name="_token"]').val() || 
                     docUjian.find('meta[name="csrf-token"]').attr('content') || csrfToken;

    // 2.b POST DataTables
    const finalPayload = `${DATATABLE_BODY_STATIC}&_token=${tokenUjian}`;
    const dataTableRes = http.post(`${BASE_URL}/siswa/ujian/datatable`, finalPayload, {
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Referer': `${BASE_URL}/siswa/ujian`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36'
        }
    });

    /* ============================
       STEP 3: EXTRACT ID & BUKA DETAIL
       ============================ */
    
    let targetId = null;

    try {
        const jsonResponse = dataTableRes.json();
        const dataList = jsonResponse.data; // Array daftar ujian

        if (dataList && dataList.length > 0) {
            // Ambil ujian pertama
            const firstExam = dataList[dataList.length - 1]; 
            
            // Convert object row jadi string biar mudah di-search
            const rowString = JSON.stringify(firstExam);
            
            // Regex mencari pola: US diikuti angka
            const match = rowString.match(/(US\d+)/);

            if (match) {
                targetId = match[1];
                console.log(`✅ [VU:${__VU}] Menemukan Ujian ID: ${targetId}`);
            }
        }
    } catch (e) {
        console.error(`❌ [VU:${__VU}] Gagal parse JSON DataTable`);
    }

    if (!targetId) {
        console.warn(`⚠️ [VU:${__VU}] Tidak ada ujian yang tersedia untuk diklik.`);
        return; 
    }

    // 2.c GET Detail Ujian
    const detailRes = http.get(`${BASE_URL}/siswa/ujian/show/${targetId}`, {
        headers: {
            'Upgrade-Insecure-Requests': '1',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Referer': `${BASE_URL}/siswa/ujian`,
            'Sec-Fetch-Site': 'same-origin',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Dest': 'document',
        }
    });

    check(detailRes, {
        "Halaman Detail Ujian (200)": (r) => r.status === 200,
        "Tidak Error 404/500": (r) => r.status !== 404 && r.status !== 500,
        "Masuk Halaman Detail": (r) => r.url.includes("/show/US"),
        "Ada Tombol Mulai": (r) => r.body.includes("Mulai") || r.body.includes("Start"), 
    });

    sleep(1);
}