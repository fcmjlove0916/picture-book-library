import { NextRequest, NextResponse } from "next/server";
import { initialBooks } from "@/data/books";

const RETURNED_MARKERS = new Set(["반납", "반납완료", "완료", "returned", "y", "yes", "true", "o", "1"]);
const VALID_REVIEW_RATINGS = new Set(["좋아요", "보통이에요", "아쉬워요"]);

interface ReviewItem {
  bookTitle: string;
  borrower: string;
  rating: string;
  comment: string;
}

function extractReviews(raw: unknown): ReviewItem[] {
  if (!Array.isArray(raw)) return [];

  const result: ReviewItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    const bookTitle = String(item.bookTitle ?? "").trim();
    const borrower = String(item.borrower ?? "").trim();
    const rating = String(item.rating ?? "").trim();
    const comment = String(item.comment ?? "").trim().slice(0, 30);

    if (!bookTitle || !borrower || !VALID_REVIEW_RATINGS.has(rating)) continue;
    result.push({ bookTitle, borrower, rating, comment });
  }
  return result;
}

function isReturnedValue(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return RETURNED_MARKERS.has(value.trim().toLowerCase());
  return false;
}

function extractBorrowedCounts(payload: unknown): Record<string, number> | null {
  if (!payload || typeof payload !== "object") return null;

  const record = payload as Record<string, unknown>;
  if (record.borrowedCounts && typeof record.borrowedCounts === "object" && !Array.isArray(record.borrowedCounts)) {
    const counts: Record<string, number> = {};
    for (const [title, count] of Object.entries(record.borrowedCounts as Record<string, unknown>)) {
      const numeric = Number(count);
      if (title.trim() && Number.isFinite(numeric) && numeric > 0) {
        counts[title.trim()] = numeric;
      }
    }
    return counts;
  }

  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(record.rows)
      ? record.rows
      : Array.isArray(record.data)
        ? record.data
        : Array.isArray(record.records)
          ? record.records
          : null;

  if (!rows) return null;

  const counts: Record<string, number> = {};
  for (const row of rows) {
    if (Array.isArray(row)) {
      const title = String(row[2] ?? "").trim();
      const firstCell = String(row[0] ?? "").trim();
      if (!title || title === "책 제목" || firstCell === "신청시각") continue;
      if (isReturnedValue(row[5])) continue;
      counts[title] = (counts[title] || 0) + 1;
    } else if (row && typeof row === "object") {
      const item = row as Record<string, unknown>;
      const title = String(item.bookTitle ?? item.title ?? item["책 제목"] ?? "").trim();
      if (!title || title === "책 제목") continue;
      if (isReturnedValue(item.returned ?? item.status ?? item["반납여부"])) continue;
      counts[title] = (counts[title] || 0) + 1;
    }
  }
  return counts;
}

type SheetStatusResult =
  | { ok: true; borrowedCounts: Record<string, number>; reviews: ReviewItem[] }
  | { ok: false; message: string };

async function fetchSheetStatus(sheetUrl: string): Promise<SheetStatusResult> {
  try {
    const sheetResponse = await fetch(sheetUrl, {
      method: "GET",
      cache: "no-store",
    });

    const rawText = await sheetResponse.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return { ok: false, message: "시트 조회(doGet) 응답이 JSON 형식이 아닙니다." };
    }

    const borrowedCounts = extractBorrowedCounts(parsed);
    if (!sheetResponse.ok || !borrowedCounts) {
      return { ok: false, message: "시트 대여 기록을 해석할 수 없습니다." };
    }

    const record = parsed as Record<string, unknown>;
    return {
      ok: true,
      borrowedCounts,
      reviews: extractReviews(record.reviews),
    };
  } catch (error) {
    console.error("대여 현황 조회 오류:", error);
    return { ok: false, message: "시트 대여 현황을 불러오지 못했습니다." };
  }
}

export async function GET() {
  const sheetUrl = process.env.SHEET_URL;

  if (!sheetUrl) {
    return NextResponse.json(
      { ok: false, message: "SHEET_URL 환경변수가 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  const result = await fetchSheetStatus(sheetUrl);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, message: result.message },
      { status: 502 }
    );
  }

  return NextResponse.json(result);
}

async function postToSheet(
  sheetUrl: string,
  payload: Record<string, unknown>,
  successMessage: string
) {
  const sheetResponse = await fetch(sheetUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  // Google Apps Script 는 리다이렉트 응답을 줄 수 있으므로 넓은 범위로 성공 판정
  if (sheetResponse.ok || sheetResponse.redirected) {
    return NextResponse.json({ ok: true, message: successMessage });
  }

  return NextResponse.json(
    { ok: false, message: "스프레드시트 저장에 실패했습니다." },
    { status: 502 }
  );
}

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
    const { type, date, bookTitle, borrower, returnDate, rating, comment } = body;

    if (!type || !date || !bookTitle) {
      return NextResponse.json(
        { ok: false, message: "필수 항목이 비어 있습니다." },
        { status: 400 }
      );
    }

    // 도서 목록에 존재하는 책인지 서버에서 공통 검증
    const normalizedTitle = typeof bookTitle === "string" ? bookTitle.trim() : "";
    const targetBook = initialBooks.find((book) => book.title === normalizedTitle);
    if (!targetBook) {
      return NextResponse.json(
        { ok: false, message: "없는 책이에요." },
        { status: 400 }
      );
    }

    const trimmedBorrower = typeof borrower === "string" ? borrower.trim() : "";

    // 한 줄 평 쓰기 분기
    if (type === "review") {
      if (!trimmedBorrower) {
        return NextResponse.json(
          { ok: false, message: "이름이나 번호를 입력해 주세요." },
          { status: 400 }
        );
      }

      if (typeof rating !== "string" || !VALID_REVIEW_RATINGS.has(rating)) {
        return NextResponse.json(
          { ok: false, message: "책이 어땠는지 표정을 골라 주세요." },
          { status: 400 }
        );
      }

      if (comment != null && typeof comment !== "string") {
        return NextResponse.json(
          { ok: false, message: "한 줄 평 형식이 올바르지 않아요." },
          { status: 400 }
        );
      }

      const rawComment = typeof comment === "string" ? comment : "";
      if (rawComment.length > 30) {
        return NextResponse.json(
          { ok: false, message: "한 줄 평은 30자까지만 쓸 수 있어요." },
          { status: 400 }
        );
      }

      return await postToSheet(
        sheetUrl,
        {
          type: "review",
          date,
          bookTitle: targetBook.title,
          borrower: trimmedBorrower,
          rating,
          comment: rawComment,
        },
        "한 줄 평이 저장되었습니다."
      );
    }

    // 도서 대여 분기
    if (!trimmedBorrower || !returnDate) {
      return NextResponse.json(
        { ok: false, message: "필수 항목이 비어 있습니다." },
        { status: 400 }
      );
    }

    // 저장 전 시트에서 현재 대여 중 권수를 조회해 재고 초과 시 409 반환 (조회 실패 시 저장 진행)
    const statusResult = await fetchSheetStatus(sheetUrl);
    if (statusResult.ok) {
      const borrowedCount = Number(statusResult.borrowedCounts[targetBook.title]) || 0;
      if (borrowedCount >= targetBook.totalCount) {
        return NextResponse.json(
          {
            ok: false,
            message: "앞서 다른 친구가 빌려 가서 지금은 빌릴 수 없어요.",
          },
          { status: 409 }
        );
      }
    }

    return await postToSheet(
      sheetUrl,
      {
        type: "rent",
        date,
        bookTitle: targetBook.title,
        borrower: trimmedBorrower,
        returnDate,
      },
      "대여 기록이 저장되었습니다."
    );
  } catch (error) {
    console.error("대여 API 오류:", error);
    return NextResponse.json(
      { ok: false, message: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

