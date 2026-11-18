import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const sheetUrl = process.env.SHEET_URL;

  if (!sheetUrl) {
    return NextResponse.json(
      { ok: false, message: "SHEET_URL 환경변수가 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();

    // 필수 필드 확인
    const { type, date, bookTitle, borrower, returnDate } = body;
    if (!type || !date || !bookTitle || !borrower || !returnDate) {
      return NextResponse.json(
        { ok: false, message: "필수 항목이 비어 있습니다." },
        { status: 400 }
      );
    }

    // SHEET_URL 로 대여 정보를 POST 전송
    const sheetResponse = await fetch(sheetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,       // "rent"
        date,       // 대여 날짜 (YYYY-MM-DD)
        bookTitle,  // 책 제목
        borrower,   // 친구 번호 또는 별명
        returnDate, // 반납 예정일 (YYYY-MM-DD)
      }),
    });

    // Google Apps Script 는 리다이렉트 응답을 줄 수 있으므로 넓은 범위로 성공 판정
    if (sheetResponse.ok || sheetResponse.redirected) {
      return NextResponse.json({ ok: true, message: "대여 기록이 저장되었습니다." });
    }

    return NextResponse.json(
      { ok: false, message: "스프레드시트 저장에 실패했습니다." },
      { status: 502 }
    );
  } catch (error) {
    console.error("대여 API 오류:", error);
    return NextResponse.json(
      { ok: false, message: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

