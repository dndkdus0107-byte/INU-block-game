/**
 * ==========================================================================
 * [INU 벽돌깨기] Google Apps Script - CRUD 웹 앱 API
 * 
 * 시트 ID: 1DwuOwyP5D1GAJSAEPFB38yg8DdiyRKVkfRgKDiQ-Pks
 * 컬럼 구성: timestamp (등록시간), name (플레이어 이름), finishtime (완료시간 mm:ss)
 * ==========================================================================
 */

const SPREADSHEET_ID = "1DwuOwyP5D1GAJSAEPFB38yg8DdiyRKVkfRgKDiQ-Pks";
const SHEET_NAME = "Sheet1"; // 시트 탭 이름 (필요 시 수정 가능)

/**
 * 활성 시트 가져오기 (첫 행 헤더가 없으면 자동 생성)
 */
function getSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.getSheets()[0];
  }
  
  // 첫 번째 행에 헤더가 없는 경우 초기화
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["timestamp", "name", "finishtime"]);
  }
  return sheet;
}

/**
 * JSON 응답 생성 헬퍼
 */
function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 1. READ (조회) - GET 요청 처리
 * 예시 파라미터:
 *  - 전체 조회 / Top 3: ?action=read
 *  - 이름으로 특정 기록 조회: ?action=read&name=홍길동
 */
function doGet(e) {
  try {
    const sheet = getSheet();
    const data = sheet.getDataRange().getValues();
    
    // 데이터가 헤더밖에 없거나 비어있는 경우
    if (data.length <= 1) {
      return createJsonResponse({ status: "success", data: [], top3: [] });
    }
    
    const headers = data[0]; // ["timestamp", "name", "finishtime"]
    const rows = data.slice(1);
    
    // 객체 배열로 매핑 (rowId는 시트의 실제 행 번호)
    let records = rows.map((row, index) => {
      let timeVal = row[2];
      let timeStr = "99:59";
      let totalSeconds = 9999;

      if (timeVal instanceof Date) {
        const m = timeVal.getMinutes().toString().padStart(2, "0");
        const s = timeVal.getSeconds().toString().padStart(2, "0");
        timeStr = `${m}:${s}`;
        totalSeconds = timeVal.getMinutes() * 60 + timeVal.getSeconds();
      } else {
        timeStr = String(timeVal || "99:59").trim();
        const parts = timeStr.split(":");
        if (parts.length === 2) {
          totalSeconds = Number(parts[0]) * 60 + Number(parts[1]);
        }
      }

      return {
        rowId: index + 2, // 2행부터 시작
        timestamp: row[0],
        name: row[1],
        finishtime: timeStr,
        seconds: totalSeconds
      };
    });

    const targetName = e && e.parameter ? e.parameter.name : null;
    if (targetName) {
      records = records.filter(r => String(r.name).trim() === String(targetName).trim());
    }

    // 완료시간 빠른 순 (오름차순) 정렬 후 Top 3 산출
    const sorted = [...records].sort((a, b) => a.seconds - b.seconds);
    const top3 = sorted.slice(0, 3);

    return createJsonResponse({
      status: "success",
      count: records.length,
      data: records,
      top3: top3
    });
  } catch (err) {
    return createJsonResponse({ status: "error", message: err.toString() });
  }
}

/**
 * 2. CREATE / UPDATE / DELETE - POST 요청 처리
 * 요청 Body (JSON 포맷):
 *  - CREATE: { "action": "create", "name": "우아연", "finishtime": "01:23" }
 *  - UPDATE: { "action": "update", "rowId": 3, "finishtime": "00:59" } 
 *            또는 { "action": "update", "name": "우아연", "finishtime": "00:59" }
 *  - DELETE: { "action": "delete", "rowId": 3 }
 *            또는 { "action": "delete", "name": "우아연" }
 */
function doPost(e) {
  try {
    const sheet = getSheet();
    let body = {};
    
    if (e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    } else if (e.parameter) {
      body = e.parameter;
    }

    const action = body.action || "create"; // 기본값 create

    // [CREATE] 새 기록 추가
    if (action === "create") {
      const now = new Date();
      // KST 한국 표준시 기준 포맷팅
      const timestamp = Utilities.formatDate(now, "Asia/Seoul", "yyyy-MM-dd HH:mm:ss");
      const name = body.name || "익명";
      const finishtime = String(body.finishtime || "00:00");

      // 작은따옴표(')를 앞에 붙여 구글 시트가 1899년 시간 객체로 변환하지 않고 텍스트("00:05")로 저장하도록 보장
      sheet.appendRow([timestamp, name, `'${finishtime}`]);

      return createJsonResponse({
        status: "success",
        message: "기록이 성공적으로 저장되었습니다.",
        created: { timestamp: timestamp, name: name, finishtime: finishtime }
      });
    }

    // [UPDATE] 기록 수정
    else if (action === "update") {
      const rowId = body.rowId;
      const targetName = body.name;
      const newFinishTime = body.finishtime;
      const newName = body.newName || targetName;

      if (rowId) {
        // rowId로 직접 수정
        if (newFinishTime) sheet.getRange(rowId, 3).setValue(newFinishTime);
        if (newName) sheet.getRange(rowId, 2).setValue(newName);
        sheet.getRange(rowId, 1).setValue(Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd HH:mm:ss"));

        return createJsonResponse({
          status: "success",
          message: `${rowId}행의 데이터가 수정되었습니다.`
        });
      } else if (targetName) {
        // 이름으로 찾아 가장 최근/일치하는 행 수정
        const data = sheet.getDataRange().getValues();
        let updated = false;
        for (let i = 1; i < data.length; i++) {
          if (String(data[i][1]).trim() === String(targetName).trim()) {
            if (newFinishTime) sheet.getRange(i + 1, 3).setValue(newFinishTime);
            sheet.getRange(i + 1, 1).setValue(Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd HH:mm:ss"));
            updated = true;
            break;
          }
        }
        if (updated) {
          return createJsonResponse({ status: "success", message: `'${targetName}'님의 기록이 수정되었습니다.` });
        } else {
          return createJsonResponse({ status: "error", message: `'${targetName}'님을 찾을 수 없습니다.` });
        }
      } else {
        return createJsonResponse({ status: "error", message: "수정할 rowId 또는 name이 필요합니다." });
      }
    }

    // [DELETE] 기록 삭제
    else if (action === "delete") {
      const rowId = body.rowId;
      const targetName = body.name;

      if (rowId && Number(rowId) > 1) {
        sheet.deleteRow(Number(rowId));
        return createJsonResponse({ status: "success", message: `${rowId}행이 삭제되었습니다.` });
      } else if (targetName) {
        const data = sheet.getDataRange().getValues();
        let deleted = false;
        // 역순 탐색하여 일치하는 행 삭제
        for (let i = data.length - 1; i >= 1; i--) {
          if (String(data[i][1]).trim() === String(targetName).trim()) {
            sheet.deleteRow(i + 1);
            deleted = true;
            break;
          }
        }
        if (deleted) {
          return createJsonResponse({ status: "success", message: `'${targetName}'님의 기록이 삭제되었습니다.` });
        } else {
          return createJsonResponse({ status: "error", message: `'${targetName}'님을 찾을 수 없습니다.` });
        }
      } else {
        return createJsonResponse({ status: "error", message: "삭제할 rowId 또는 name이 필요합니다." });
      }
    }

    return createJsonResponse({ status: "error", message: `알 수 없는 action: ${action}` });
  } catch (err) {
    return createJsonResponse({ status: "error", message: err.toString() });
  }
}
