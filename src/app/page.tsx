"use client";

import { useEffect, useState } from "react";
import { initialBooks } from "@/data/books";

// 표지 이미지가 없을 때 카드 순서대로 돌려 쓰는 파스텔 바탕색
const coverColors = ["#FFD9C7", "#CDEBDD", "#D9D2F7", "#CFE3FA", "#FFEFA8", "#FFCFE0"];

// 컴퓨터의 현지 날짜를 YYYY-MM-DD 형식으로 반환 (한국 시간 오전 9시 전 날짜 어긋남 방지)
function formatLocalDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// 오늘 날짜를 YYYY-MM-DD 형식으로 반환
function todayString(): string {
  return formatLocalDate(new Date());
}

// 오늘부터 N일 뒤 날짜를 YYYY-MM-DD 형식으로 반환
function daysLater(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return formatLocalDate(d);
}

// 빌리기 모달에서 사용할 책 정보 타입
interface BorrowTarget {
  id: number;
  title: string;
  coverEmoji: string;
  cover?: string;
}

type ReviewRating = "좋아요" | "보통이에요" | "아쉬워요";

interface BookReview {
  bookTitle: string;
  borrower: string;
  rating: ReviewRating;
  comment: string;
}

const REVIEW_OPTIONS: {
  value: ReviewRating;
  bg: string;
  mouthPath: string;
}[] = [
  { value: "좋아요", bg: "#CDEBDD", mouthPath: "M8 14.5s1.6 2.8 4 2.8 4-2.8 4-2.8" },
  { value: "보통이에요", bg: "#FFEFA8", mouthPath: "M8.5 15.5h7" },
  { value: "아쉬워요", bg: "#FFE3EE", mouthPath: "M8 17.2s1.6-2.8 4-2.8 4 2.8 4 2.8" },
];

function ReviewFaceIcon({
  rating,
  size = 28,
}: {
  rating: ReviewRating;
  size?: number;
}) {
  const option = REVIEW_OPTIONS.find((item) => item.value === rating) ?? REVIEW_OPTIONS[0];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#3A3350"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="11" fill={option.bg} stroke="none" />
      <circle cx="9" cy="10" r="1.2" fill="#3A3350" stroke="none" />
      <circle cx="15" cy="10" r="1.2" fill="#3A3350" stroke="none" />
      <path d={option.mouthPath} />
    </svg>
  );
}

function ModalBookCover({
  target,
  failed,
  onError,
}: {
  target: BorrowTarget;
  failed: boolean;
  onError: () => void;
}) {
  return (
    <div className="w-[72px] aspect-[3/4] rounded-[16px] overflow-hidden shrink-0 bg-[#FFD9C7] flex items-center justify-center">
      {target.cover && !failed ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={target.cover}
          alt={target.title}
          referrerPolicy="no-referrer"
          onError={onError}
          className="w-full h-full object-cover"
        />
      ) : (
        <span className="text-[36px] select-none">{target.coverEmoji}</span>
      )}
    </div>
  );
}

export default function Home() {
  const [books, setBooks] = useState(initialBooks);
  const [isSyncing, setIsSyncing] = useState<boolean>(true);
  const [syncError, setSyncError] = useState<boolean>(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("전체");
  const [onlyAvailable, setOnlyAvailable] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");

  // 이미지 로드 실패한 책들의 ID 저장 (onError 시 이모지로 자동 대체)
  const [failedImages, setFailedImages] = useState<Record<number, boolean>>({});

  // ── 빌리기 모달 상태 ──
  const [borrowTarget, setBorrowTarget] = useState<BorrowTarget | null>(null); // 빌리기 입력 모달
  const [borrower, setBorrower] = useState<string>("");                        // 친구 번호/별명
  const [returnDate, setReturnDate] = useState<string>(daysLater(7));          // 반납 예정일
  const [borrowerError, setBorrowerError] = useState<boolean>(false);          // 입력 비어있음 경고
  const [submitError, setSubmitError] = useState<string>("");                  // 서버 저장 오류 문구
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);            // 전송 중 표시

  // ── 성공 모달 상태 ──
  const [successBook, setSuccessBook] = useState<BorrowTarget | null>(null);

  // ── 한 줄 평 쓰기 및 보기 모달 상태 ──
  const [reviews, setReviews] = useState<BookReview[]>([]);
  const [reviewListBook, setReviewListBook] = useState<BorrowTarget | null>(null);
  const [reviewTarget, setReviewTarget] = useState<BorrowTarget | null>(null);
  const [reviewBorrower, setReviewBorrower] = useState<string>("");
  const [reviewRating, setReviewRating] = useState<ReviewRating | "">("");
  const [reviewComment, setReviewComment] = useState<string>("");
  const [reviewBorrowerError, setReviewBorrowerError] = useState<boolean>(false);
  const [reviewRatingError, setReviewRatingError] = useState<boolean>(false);
  const [reviewSubmitError, setReviewSubmitError] = useState<string>("");
  const [isReviewSubmitting, setIsReviewSubmitting] = useState<boolean>(false);
  const [reviewSuccess, setReviewSuccess] = useState<boolean>(false);

  // 마운트 시 구글 시트 대여 기록을 불러와 남은 권수 동기화
  useEffect(() => {
    let cancelled = false;

    async function syncBorrowedCounts() {
      try {
        const res = await fetch("/api/rent", { cache: "no-store" });
        const data = await res.json();
        if (!cancelled) {
          if (res.ok && data.ok && data.borrowedCounts) {
            const borrowedCounts: Record<string, number> = data.borrowedCounts;
            setBooks((prevBooks) =>
              prevBooks.map((book) => ({
                ...book,
                availableCount: Math.max(
                  0,
                  book.totalCount - (Number(borrowedCounts[book.title]) || 0)
                ),
              }))
            );
            setReviews(Array.isArray(data.reviews) ? data.reviews : []);
            setSyncError(false);
          } else {
            setSyncError(true);
          }
        }
      } catch {
        if (!cancelled) {
          setSyncError(true);
        }
      } finally {
        if (!cancelled) {
          setIsSyncing(false);
        }
      }
    }

    syncBorrowedCounts();
    return () => {
      cancelled = true;
    };
  }, []);

  // 1. 위쪽 통계 자동 계산 (전체 권수, 남은 권수, 대여 중 권수)
  const totalBooksCount = books.reduce((acc, cur) => acc + cur.totalCount, 0);
  const availableBooksCount = books.reduce((acc, cur) => acc + cur.availableCount, 0);
  const borrowedBooksCount = totalBooksCount - availableBooksCount;

  // 필터링된 책 목록 (주제 필터 + 빌릴 수 있는 책만 보기 체크 상자 연동)
  const filteredBooks = books.filter((book) => {
    const matchesCategory = selectedCategory === "전체" || book.category === selectedCategory;
    const matchesAvailable = onlyAvailable ? book.availableCount > 0 : true;
    const matchesSearch =
      book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      book.author.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesAvailable && matchesSearch;
  });

  // [빌리기] 버튼 클릭 → 입력 모달 열기
  const handleBorrowClick = (bookId: number) => {
    if (isSyncing) return;
    const targetBook = books.find((b) => b.id === bookId);
    if (!targetBook || targetBook.availableCount <= 0) return;

    setBorrowTarget({
      id: targetBook.id,
      title: targetBook.title,
      coverEmoji: targetBook.coverEmoji,
      cover: targetBook.cover,
    });
    setBorrower("");
    setReturnDate(daysLater(7));
    setBorrowerError(false);
    setSubmitError("");
    setIsSubmitting(false);
  };

  // 모달 닫기
  const closeBorrowModal = () => {
    setBorrowTarget(null);
    setBorrower("");
    setBorrowerError(false);
    setSubmitError("");
    setIsSubmitting(false);
  };

  // [빌리기 확인] 제출
  const handleSubmitBorrow = async () => {
    if (!borrowTarget) return;

    // 입력칸 비어있으면 경고
    if (borrower.trim() === "") {
      setBorrowerError(true);
      return;
    }

    setBorrowerError(false);
    setSubmitError("");
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/rent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "rent",
          date: todayString(),
          bookTitle: borrowTarget.title,
          borrower: borrower.trim(),
          returnDate,
        }),
      });

      const data = await res.json();

      if (res.ok && data.ok) {
        // 남은 권수 1 줄이기
        setBooks((prevBooks) =>
          prevBooks.map((b) =>
            b.id === borrowTarget.id
              ? { ...b, availableCount: b.availableCount - 1 }
              : b
          )
        );

        // 입력 모달 닫고 성공 모달 열기
        const successTarget = { ...borrowTarget };
        closeBorrowModal();
        setSuccessBook(successTarget);
      } else {
        setSubmitError(data.message || "저장에 실패했어요. 다시 시도해 주세요.");
        setIsSubmitting(false);
      }
    } catch {
      setSubmitError("서버와 연결할 수 없어요. 인터넷을 확인해 주세요.");
      setIsSubmitting(false);
    }
  };

  // [한 줄 평 쓰기] 버튼 클릭 → 한 줄 평 모달 열기
  const handleReviewClick = (bookId: number) => {
    const targetBook = books.find((b) => b.id === bookId);
    if (!targetBook) return;

    setReviewTarget({
      id: targetBook.id,
      title: targetBook.title,
      coverEmoji: targetBook.coverEmoji,
      cover: targetBook.cover,
    });
    setReviewBorrower("");
    setReviewRating("");
    setReviewComment("");
    setReviewBorrowerError(false);
    setReviewRatingError(false);
    setReviewSubmitError("");
    setIsReviewSubmitting(false);
    setReviewSuccess(false);
  };

  // 한 줄 평 모달 닫기
  const closeReviewModal = () => {
    setReviewTarget(null);
    setReviewBorrower("");
    setReviewRating("");
    setReviewComment("");
    setReviewBorrowerError(false);
    setReviewRatingError(false);
    setReviewSubmitError("");
    setIsReviewSubmitting(false);
    setReviewSuccess(false);
  };

  // [보내기] 한 줄 평 제출
  const handleSubmitReview = async () => {
    if (!reviewTarget) return;

    const missingBorrower = reviewBorrower.trim() === "";
    const missingRating = reviewRating === "";
    setReviewBorrowerError(missingBorrower);
    setReviewRatingError(missingRating);
    if (missingBorrower || missingRating) return;

    setReviewSubmitError("");
    setIsReviewSubmitting(true);

    try {
      const res = await fetch("/api/rent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "review",
          date: todayString(),
          bookTitle: reviewTarget.title,
          borrower: reviewBorrower.trim(),
          rating: reviewRating,
          comment: reviewComment.trim(),
        }),
      });

      const data = await res.json();

      if (res.ok && data.ok) {
        setReviewSuccess(true);
        setIsReviewSubmitting(false);
      } else {
        setReviewSubmitError(data.message || "저장에 실패했어요. 다시 시도해 주세요.");
        setIsReviewSubmitting(false);
      }
    } catch {
      setReviewSubmitError("서버와 연결할 수 없어요. 인터넷을 확인해 주세요.");
      setIsReviewSubmitting(false);
    }
  };

  const categories = ["전체", "동물", "가족", "친구", "감정", "자연"];

  return (
    <div className="min-h-screen bg-[#FFF7F0] text-[#3A3350] relative overflow-x-hidden">
      {/* 배경 구름 장식 */}
      <svg
        width="260"
        height="130"
        viewBox="0 0 260 130"
        aria-hidden="true"
        className="pointer-events-none absolute right-[-30px] top-[90px]"
      >
        <path
          d="M40 110a32 32 0 0 1 4-63 46 46 0 0 1 88-6 36 36 0 0 1 82 20 28 28 0 0 1-8 49z"
          fill="#EFE9FF"
        />
      </svg>
      <svg
        width="200"
        height="100"
        viewBox="0 0 260 130"
        aria-hidden="true"
        className="pointer-events-none absolute left-[-40px] top-[300px]"
      >
        <path
          d="M40 110a32 32 0 0 1 4-63 46 46 0 0 1 88-6 36 36 0 0 1 82 20 28 28 0 0 1-8 49z"
          fill="#FFE9DE"
        />
      </svg>

      {/* 머리글 */}
      <header className="relative">
        <div className="max-w-[1120px] mx-auto px-5 sm:px-[40px] py-[26px] flex items-center justify-between flex-wrap gap-[16px]">
          <div className="flex items-center gap-[14px]">
            <div className="w-[56px] h-[56px] rounded-[20px] bg-[#B9A7F2] flex items-center justify-center shrink-0">
              <svg
                width="32"
                height="32"
                viewBox="0 0 26 26"
                fill="none"
                stroke="#fff"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 6h6a3 3 0 0 1 3 3v12a3 3 0 0 0-3-3H4z" />
                <path d="M22 6h-6a3 3 0 0 0-3 3v12a3 3 0 0 1 3-3h6z" />
              </svg>
            </div>
            <div className="font-hand text-[26px] tracking-[-0.02em]">
              그림책 도서관
            </div>
          </div>

          <a
            href="#s-list"
            className="inline-flex items-center min-h-[52px] px-[28px] rounded-full bg-white text-[#4B3A8F] font-bold text-[18px] no-underline shadow-[0_5px_0_-1px_rgba(120,100,170,0.22)] active:translate-y-[2px] transition-transform"
          >
            책 둘러보기
          </a>
        </div>
      </header>

      <main className="relative max-w-[1120px] mx-auto px-5 sm:px-[40px] pt-[12px] pb-[90px]">
        {/* 소개 영역 */}
        <section className="text-center pt-[30px] pb-[36px]">
          <div className="inline-block px-[22px] py-[8px] rounded-full bg-[#FFE3EE] text-[#9A2F5E] text-[19px] font-hand">
            오늘은 어떤 그림책을 읽어 볼까?
          </div>

          <h1 className="mt-[18px] mb-0 font-hand text-[52px] sm:text-[80px] leading-[1.2] tracking-[-0.03em] break-keep">
            우리 반 <span className="text-[#7B5FE0]">그림책 도서관</span>
          </h1>

          <p className="mt-[14px] mb-0 text-[22px] text-[#4F4768]">
            읽고 싶은 책의{" "}
            <strong className="bg-[#FFEFA8] px-[12px] py-[2px] rounded-[12px] font-bold text-[#3A3350]">
              빌리기
            </strong>{" "}
            단추를 꾹 눌러 보세요!
          </p>
        </section>

        {/* 통계 3칸 */}
        <section className="flex justify-center gap-[18px] flex-wrap mb-[38px]">
          <div className="bg-white rounded-full px-[32px] py-[14px] flex items-baseline gap-[16px] shadow-[0_5px_0_-1px_rgba(120,100,170,0.18)]">
            <span className="text-[16px]">보유 도서</span>
            <span className="font-semibold text-[35px]">
              {isSyncing ? (
                "…"
              ) : (
                <>
                  {totalBooksCount}
                  <span className="text-[18px] ml-[2px]">권</span>
                </>
              )}
            </span>
          </div>

          <div className="bg-[#CDEBDD] rounded-full px-[32px] py-[14px] flex items-baseline gap-[16px] shadow-[0_6px_0_-2px_rgba(40,120,90,0.2)]">
            <span className="text-[16px] text-[#14543C]">대여 가능</span>
            <span className="font-semibold text-[35px] text-[#14543C]">
              {isSyncing ? (
                "…"
              ) : (
                <>
                  {availableBooksCount}
                  <span className="text-[18px] ml-[2px]">권</span>
                </>
              )}
            </span>
          </div>

          <div className="bg-[#FFD9C7] rounded-full px-[32px] py-[14px] flex items-baseline gap-[16px] shadow-[0_6px_0_-2px_rgba(170,90,50,0.2)]">
            <span className="text-[16px] text-[#7A3A18]">대여 중</span>
            <span className="font-semibold text-[35px] text-[#7A3A18]">
              {isSyncing ? (
                "…"
              ) : (
                <>
                  {borrowedBooksCount}
                  <span className="text-[18px] ml-[2px]">권</span>
                </>
              )}
            </span>
          </div>
        </section>

        {/* 필터 줄 */}
        <section
          id="s-list"
          className="flex flex-wrap items-center justify-center gap-[14px] mb-[34px]"
        >
          {categories.map((cat) => {
            const isSelected = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`min-h-[54px] px-[28px] inline-flex items-center justify-center rounded-full text-[20px] cursor-pointer transition-transform active:translate-y-[2px] ${
                  isSelected
                    ? "bg-[#7B5FE0] text-white font-bold shadow-[0_5px_0_-1px_rgba(60,40,140,0.35)]"
                    : "bg-white text-[#3A3350] shadow-[0_5px_0_-1px_rgba(120,100,170,0.18)]"
                }`}
              >
                {cat}
              </button>
            );
          })}

          <label
            htmlFor="only-available"
            className="inline-flex items-center gap-[12px] text-[20px] min-h-[54px] px-[24px] rounded-full bg-[#CDEBDD] text-[#14543C] cursor-pointer select-none"
          >
            <input
              id="only-available"
              type="checkbox"
              checked={onlyAvailable}
              onChange={(e) => setOnlyAvailable(e.target.checked)}
              className="w-[26px] h-[26px] accent-[#2E8B63] m-0 cursor-pointer"
            />
            <span>빌릴 수 있는 책만 보기</span>
          </label>
        </section>

        {!isSyncing && syncError && (
          <p
            role="status"
            className="text-center text-[15px] text-[#B3365B] mb-[20px]"
          >
            대여 현황을 못 가져왔어요. 새로고침해 주세요.
          </p>
        )}

        {/* 책 카드 3열 */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-[28px] gap-y-[34px]">
          {filteredBooks.map((book, index) => {
            const isAvailable = book.availableCount > 0;
            const hasValidCover = Boolean(book.cover) && !failedImages[book.id];
            const bookReviews = reviews.filter((r) => r.bookTitle === book.title);
            const latestReview = bookReviews[0];

            return (
              <article
                key={book.id}
                className={`bg-white rounded-[36px] p-[20px] pb-[24px] flex flex-col gap-[14px] shadow-[0_10px_0_-2px_rgba(120,100,170,0.14)] ${
                  !isSyncing && !isAvailable ? "opacity-60" : ""
                }`}
              >
                {/* 표지 영역 (3:4) */}
                <div
                  className="relative w-full aspect-[3/4] rounded-[28px] overflow-hidden"
                  style={
                    !hasValidCover
                      ? { backgroundColor: coverColors[index % 6] }
                      : undefined
                  }
                >
                  {hasValidCover ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={book.cover}
                      alt={book.title}
                      referrerPolicy="no-referrer"
                      onError={() => {
                        setFailedImages((prev) => ({
                          ...prev,
                          [book.id]: true,
                        }));
                      }}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-[76px] select-none">
                        {book.coverEmoji}
                      </span>
                    </div>
                  )}

                  <span className="absolute top-[16px] left-[16px] px-[14px] py-[5px] rounded-full bg-white/80 text-[#3A3350] text-[16px] font-hand">
                    {book.category}
                  </span>
                </div>

                {/* 책 제목 */}
                <h2 className="font-hand text-[27px] leading-[1.3] tracking-[-0.02em] text-[#3A3350] px-[4px]">
                  {book.title}
                </h2>

                {/* 작가 & 남은 책 배지 */}
                <div className="flex items-center justify-between gap-[8px] px-[4px] mt-auto">
                  <span className="text-[18px] text-[#4F4768]">
                    {book.author}
                  </span>
                  <span
                    className={`px-[14px] py-[5px] rounded-full text-[17px] font-hand shrink-0 ${
                      isSyncing || !isAvailable
                        ? "bg-[#ECE9F3] text-[#4F4768]"
                        : book.availableCount === 1
                          ? "bg-[#FFE3EE] text-[#B3365B]"
                          : "bg-[#CDEBDD] text-[#14543C]"
                    }`}
                  >
                    {isSyncing
                      ? "확인 중…"
                      : book.availableCount === 1
                        ? "마감 임박 · 1권 남음"
                        : isAvailable
                          ? `남은 책 ${book.availableCount}권`
                          : "다 빌려갔어요"}
                  </span>
                </div>

                {/* 승인된 한 줄 평 (가장 최근 1개만 표시, 없으면 상자 숨김) */}
                {latestReview && (
                  <div className="bg-[#F6F2FF] rounded-[20px] px-[14px] py-[12px] flex items-center justify-between gap-[10px]">
                    <div className="flex items-start gap-[10px] min-w-0">
                      <ReviewFaceIcon rating={latestReview.rating} size={28} />
                      <div className="min-w-0">
                        <p className="text-[15px] leading-[1.4] text-[#3A3350] break-words">
                          {latestReview.comment || latestReview.rating}
                        </p>
                        <p className="text-[13px] text-[#4F4768] mt-0.5">
                          – {latestReview.borrower}
                        </p>
                      </div>
                    </div>

                    {bookReviews.length >= 2 && (
                      <button
                        type="button"
                        onClick={() =>
                          setReviewListBook({
                            id: book.id,
                            title: book.title,
                            coverEmoji: book.coverEmoji,
                            cover: book.cover,
                          })
                        }
                        className="min-h-[48px] px-[12px] rounded-full bg-white text-[#4B3A8F] text-[14px] font-bold shrink-0 cursor-pointer border border-[#D9D2F7] hover:bg-[#EFE9FF] transition-colors"
                      >
                        더 보기 ({bookReviews.length})
                      </button>
                    )}
                  </div>
                )}

                {/* 빌리기 & 한 줄 평 쓰기 버튼 */}
                <div className="flex flex-col gap-[10px]">
                  {isSyncing || isAvailable ? (
                    <button
                      type="button"
                      disabled={isSyncing}
                      onClick={() => handleBorrowClick(book.id)}
                      className={`w-full min-h-[68px] rounded-full bg-[#7B5FE0] text-white font-hand text-[26px] flex items-center justify-center shadow-[0_7px_0_-1px_rgba(60,40,140,0.35)] transition-transform ${
                        isSyncing
                          ? "opacity-60 cursor-not-allowed"
                          : "cursor-pointer hover:brightness-105 active:translate-y-[2px]"
                      }`}
                    >
                      빌리기
                    </button>
                  ) : (
                    <div className="w-full min-h-[68px] rounded-full bg-[#ECE9F3] text-[#4F4768] font-hand text-[22px] flex items-center justify-center select-none">
                      친구가 대여 중
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => handleReviewClick(book.id)}
                    className="w-full min-h-[52px] rounded-full bg-white border-2 border-[#D9D2F7] text-[#4B3A8F] font-hand text-[20px] flex items-center justify-center cursor-pointer hover:bg-[#F6F2FF] active:translate-y-[1px] transition-all"
                  >
                    한 줄 평 쓰기
                  </button>
                </div>
              </article>
            );
          })}
        </section>

        {/* 결과가 없을 때 안내 영역 */}
        {filteredBooks.length === 0 && (
          <div className="text-center py-20 bg-white rounded-[36px] shadow-[0_10px_0_-2px_rgba(120,100,170,0.14)] mt-6 px-6 space-y-4">
            <h2 className="font-hand text-[36px] text-[#3A3350]">
              찾는 책이 없어요
            </h2>
            <p className="text-[18px] text-[#4F4768] max-w-md mx-auto">
              다른 주제를 누르거나 &lsquo;빌릴 수 있는 책만 보기&rsquo;를 풀어 보세요.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory("전체");
                  setOnlyAvailable(false);
                  setSearchQuery("");
                }}
                className="min-h-[56px] px-8 rounded-full bg-[#7B5FE0] text-white font-hand text-[22px] shadow-[0_7px_0_-1px_rgba(60,40,140,0.35)] cursor-pointer hover:brightness-105 active:translate-y-[2px] transition-transform"
              >
                모든 책 다시 보기
              </button>
            </div>
          </div>
        )}
      </main>

      {/* ── 빌리기 입력 모달 ── */}
      {borrowTarget && (
        <div
          onClick={closeBorrowModal}
          className="fixed inset-0 bg-[rgba(58,51,80,0.45)] z-50 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-[36px] p-[28px] max-w-[480px] w-full shadow-[0_10px_0_-2px_rgba(120,100,170,0.14)] space-y-5"
          >
            {/* 작은 표지 + 책 제목 + 작가 */}
            <div className="flex items-center gap-4">
              <ModalBookCover
                target={borrowTarget}
                failed={Boolean(failedImages[borrowTarget.id])}
                onError={() => {
                  setFailedImages((prev) => ({
                    ...prev,
                    [borrowTarget.id]: true,
                  }));
                }}
              />
              <div className="min-w-0">
                <h3 className="font-hand text-[28px] leading-[1.3] text-[#3A3350]">
                  {borrowTarget.title}
                </h3>
                <p className="text-[16px] text-[#4F4768] mt-0.5">
                  {books.find((b) => b.id === borrowTarget.id)?.author}
                </p>
              </div>
            </div>

            {/* 빌리는 친구 이름 */}
            <div>
              <label
                htmlFor="borrower-input"
                className="block text-[16px] font-bold text-[#3A3350] mb-2"
              >
                빌리는 친구 이름
              </label>
              <input
                id="borrower-input"
                type="text"
                value={borrower}
                onChange={(e) => {
                  setBorrower(e.target.value);
                  if (e.target.value.trim() !== "") setBorrowerError(false);
                }}
                placeholder="예: 7번, 토끼, 별님"
                className="w-full h-[56px] px-[22px] rounded-full border-2 border-[#D9D2F7] bg-white text-[20px] text-[#3A3350] placeholder-[#4F4768]/50 focus:outline-none focus:border-[#7B5FE0] focus:ring-4 focus:ring-[#7B5FE0]/20"
              />
              {borrowerError && (
                <p className="text-[16px] text-[#B3365B] mt-1.5">
                  이름이나 번호를 입력해 주세요.
                </p>
              )}
            </div>

            {/* 반납 예정일 */}
            <div>
              <label
                htmlFor="return-date-input"
                className="block text-[16px] font-bold text-[#3A3350] mb-2"
              >
                반납 예정일
              </label>
              <input
                id="return-date-input"
                type="date"
                value={returnDate}
                min={todayString()}
                onChange={(e) => setReturnDate(e.target.value)}
                className="w-full h-[56px] px-[22px] rounded-full border-2 border-[#D9D2F7] bg-white text-[20px] text-[#3A3350] focus:outline-none focus:border-[#7B5FE0] focus:ring-4 focus:ring-[#7B5FE0]/20"
              />
              <div className="flex flex-wrap gap-2 mt-2.5">
                {[3, 7, 14].map((days) => {
                  const targetDate = daysLater(days);
                  const isChipSelected = returnDate === targetDate;
                  return (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setReturnDate(targetDate)}
                      className={`min-h-[48px] px-[18px] rounded-full text-[16px] font-medium cursor-pointer transition-transform active:translate-y-[1px] ${
                        isChipSelected
                          ? "bg-[#7B5FE0] text-white shadow-[0_5px_0_-1px_rgba(60,40,140,0.35)]"
                          : "bg-white text-[#3A3350] shadow-[0_5px_0_-1px_rgba(120,100,170,0.18)]"
                      }`}
                    >
                      {days}일 뒤
                    </button>
                  );
                })}
              </div>
            </div>

            {submitError && (
              <p
                role="alert"
                className="text-[16px] text-[#B3365B] bg-[#FFE3EE] px-[18px] py-[12px] rounded-[20px]"
              >
                {submitError}
              </p>
            )}

            {/* 버튼 영역 */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={closeBorrowModal}
                disabled={isSubmitting}
                className="flex-1 min-h-[60px] rounded-full bg-[#ECE9F3] text-[#3A3350] text-[18px] font-bold flex items-center justify-center cursor-pointer disabled:opacity-60"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSubmitBorrow}
                disabled={isSubmitting}
                className="flex-[1.5] min-h-[68px] rounded-full bg-[#7B5FE0] text-white font-hand text-[26px] shadow-[0_7px_0_-1px_rgba(60,40,140,0.35)] flex items-center justify-center cursor-pointer disabled:opacity-60 hover:brightness-105 active:translate-y-[2px] transition-transform"
              >
                {isSubmitting ? "기록하는 중…" : "빌리기"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 빌렸어요(완료) 창 ── */}
      {successBook && (
        <div
          onClick={() => setSuccessBook(null)}
          className="fixed inset-0 bg-[rgba(58,51,80,0.45)] z-50 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-[36px] p-[28px] max-w-[480px] w-full shadow-[0_10px_0_-2px_rgba(120,100,170,0.14)] text-center space-y-4"
          >
            <div className="w-[96px] h-[96px] rounded-full bg-[#CDEBDD] mx-auto flex items-center justify-center">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <h3 className="font-hand text-[36px] text-[#7B5FE0]">빌렸어요!</h3>

            <p className="font-hand text-[24px] text-[#3A3350]">
              {successBook.title}
            </p>

            <p className="text-[20px] text-[#4F4768]">
              반납일은 {Number(returnDate.split("-")[1])}월{" "}
              {Number(returnDate.split("-")[2])}일이에요.
            </p>

            <button
              type="button"
              onClick={() => setSuccessBook(null)}
              className="w-full min-h-[68px] rounded-full bg-[#7B5FE0] text-white font-hand text-[26px] shadow-[0_7px_0_-1px_rgba(60,40,140,0.35)] flex items-center justify-center cursor-pointer hover:brightness-105 active:translate-y-[2px] transition-transform"
            >
              확인
            </button>
          </div>
        </div>
      )}

      {/* ── 한 줄 평 쓰기 모달 ── */}
      {reviewTarget && (
        <div
          onClick={closeReviewModal}
          className="fixed inset-0 bg-[rgba(58,51,80,0.45)] z-50 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-[36px] p-[28px] max-w-[480px] w-full shadow-[0_10px_0_-2px_rgba(120,100,170,0.14)] space-y-5"
          >
            {reviewSuccess ? (
              <div className="text-center space-y-4">
                <div className="w-[96px] h-[96px] rounded-full bg-[#CDEBDD] mx-auto flex items-center justify-center">
                  <svg
                    width="48"
                    height="48"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#FFFFFF"
                    strokeWidth="3.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                </div>

                <p className="text-[16px] text-[#4F4768]">
                  {reviewTarget.title}
                </p>

                <h3 className="font-hand text-[30px] leading-[1.35] text-[#7B5FE0] break-keep">
                  고마워요! 선생님이 확인하면 모두에게 보여요.
                </h3>

                <button
                  type="button"
                  onClick={closeReviewModal}
                  className="w-full min-h-[68px] rounded-full bg-[#7B5FE0] text-white font-hand text-[26px] shadow-[0_7px_0_-1px_rgba(60,40,140,0.35)] flex items-center justify-center cursor-pointer hover:brightness-105 active:translate-y-[2px] transition-transform"
                >
                  확인
                </button>
              </div>
            ) : (
              <>
                {/* 작은 표지 + 책 제목 + 안내문 */}
                <div className="flex items-center gap-4">
                  <ModalBookCover
                    target={reviewTarget}
                    failed={Boolean(failedImages[reviewTarget.id])}
                    onError={() => {
                      setFailedImages((prev) => ({
                        ...prev,
                        [reviewTarget.id]: true,
                      }));
                    }}
                  />
                  <div className="min-w-0">
                    <h3 className="font-hand text-[28px] leading-[1.3] text-[#3A3350]">
                      {reviewTarget.title}
                    </h3>
                    <p className="text-[16px] text-[#4F4768] mt-0.5">
                      이 책 어땠어요?
                    </p>
                  </div>
                </div>

                {/* 이름 입력칸 */}
                <div>
                  <label
                    htmlFor="review-borrower-input"
                    className="block text-[16px] font-bold text-[#3A3350] mb-2"
                  >
                    나는 누구예요?
                  </label>
                  <input
                    id="review-borrower-input"
                    type="text"
                    value={reviewBorrower}
                    onChange={(e) => {
                      setReviewBorrower(e.target.value);
                      if (e.target.value.trim() !== "") {
                        setReviewBorrowerError(false);
                      }
                    }}
                    placeholder="예: 7번, 토끼, 별님"
                    className="w-full h-[56px] px-[22px] rounded-full border-2 border-[#D9D2F7] bg-white text-[20px] text-[#3A3350] placeholder-[#4F4768]/50 focus:outline-none focus:border-[#7B5FE0] focus:ring-4 focus:ring-[#7B5FE0]/20"
                  />
                  {reviewBorrowerError && (
                    <p className="text-[16px] text-[#B3365B] mt-1.5">
                      이름이나 번호를 입력해 주세요.
                    </p>
                  )}
                </div>

                {/* 표정 버튼 3개 */}
                <div>
                  <div className="grid grid-cols-3 gap-3">
                    {REVIEW_OPTIONS.map((option) => {
                      const isSelected = reviewRating === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => {
                            setReviewRating(option.value);
                            setReviewRatingError(false);
                          }}
                          className={`min-h-[96px] rounded-[24px] bg-white p-3 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${
                            isSelected
                              ? "border-4 border-[#7B5FE0] scale-[1.03] shadow-[0_6px_0_-1px_rgba(60,40,140,0.28)]"
                              : "border-2 border-[#D9D2F7] shadow-[0_5px_0_-1px_rgba(120,100,170,0.14)] hover:border-[#B9A7F2]"
                          }`}
                        >
                          <ReviewFaceIcon rating={option.value} size={44} />
                          <span className="font-hand text-[19px] text-[#3A3350]">
                            {option.value}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {reviewRatingError && (
                    <p className="text-[16px] text-[#B3365B] mt-1.5">
                      책이 어땠는지 표정을 골라 주세요.
                    </p>
                  )}
                </div>

                {/* 선택 글쓰기 (최대 30자) */}
                <div>
                  <label
                    htmlFor="review-comment-input"
                    className="block text-[16px] font-bold text-[#3A3350] mb-2"
                  >
                    하고 싶은 말이 있으면 써 보세요 (선택)
                  </label>
                  <input
                    id="review-comment-input"
                    type="text"
                    maxLength={30}
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value.slice(0, 30))}
                    placeholder="예: 그림이 정말 귀여웠어요"
                    className="w-full h-[56px] px-[22px] rounded-full border-2 border-[#D9D2F7] bg-white text-[18px] text-[#3A3350] placeholder-[#4F4768]/50 focus:outline-none focus:border-[#7B5FE0] focus:ring-4 focus:ring-[#7B5FE0]/20"
                  />
                  <div className="text-right text-[14px] text-[#4F4768] mt-1 pr-2">
                    {reviewComment.length}/30
                  </div>
                </div>

                {reviewSubmitError && (
                  <p
                    role="alert"
                    className="text-[16px] text-[#B3365B] bg-[#FFE3EE] px-[18px] py-[12px] rounded-[20px]"
                  >
                    {reviewSubmitError}
                  </p>
                )}

                {/* 버튼 영역 */}
                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={closeReviewModal}
                    disabled={isReviewSubmitting}
                    className="flex-1 min-h-[60px] rounded-full bg-[#ECE9F3] text-[#3A3350] text-[18px] font-bold flex items-center justify-center cursor-pointer disabled:opacity-60"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmitReview}
                    disabled={isReviewSubmitting}
                    className="flex-[1.5] min-h-[68px] rounded-full bg-[#7B5FE0] text-white font-hand text-[26px] shadow-[0_7px_0_-1px_rgba(60,40,140,0.35)] flex items-center justify-center cursor-pointer disabled:opacity-60 hover:brightness-105 active:translate-y-[2px] transition-transform"
                  >
                    {isReviewSubmitting ? "보내는 중…" : "보내기"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── 한 줄 평 모음 창 ── */}
      {reviewListBook && (
        <div
          onClick={() => setReviewListBook(null)}
          className="fixed inset-0 bg-[rgba(58,51,80,0.45)] z-50 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-[36px] p-[28px] max-w-[480px] w-full max-h-[85vh] flex flex-col gap-4 shadow-[0_10px_0_-2px_rgba(120,100,170,0.14)]"
          >
            <div className="flex items-center gap-4 shrink-0">
              <ModalBookCover
                target={reviewListBook}
                failed={Boolean(failedImages[reviewListBook.id])}
                onError={() => {
                  setFailedImages((prev) => ({
                    ...prev,
                    [reviewListBook.id]: true,
                  }));
                }}
              />
              <div className="min-w-0">
                <h3 className="font-hand text-[28px] leading-[1.3] text-[#3A3350]">
                  {reviewListBook.title}
                </h3>
                <p className="text-[16px] text-[#4F4768] mt-0.5">
                  친구들의 한 줄 평 모음
                </p>
              </div>
            </div>

            <div className="overflow-y-auto space-y-3 pr-1">
              {reviews
                .filter((r) => r.bookTitle === reviewListBook.title)
                .map((review, idx) => (
                  <div
                    key={`${review.borrower}-${idx}`}
                    className="bg-[#F6F2FF] rounded-[20px] px-[16px] py-[14px] flex items-start gap-[12px]"
                  >
                    <ReviewFaceIcon rating={review.rating} size={28} />
                    <div className="min-w-0">
                      <p className="text-[16px] leading-[1.45] text-[#3A3350] break-words">
                        {review.comment || review.rating}
                      </p>
                      <p className="text-[14px] text-[#4F4768] mt-1">
                        – {review.borrower}
                      </p>
                    </div>
                  </div>
                ))}
            </div>

            <button
              type="button"
              onClick={() => setReviewListBook(null)}
              className="w-full min-h-[60px] rounded-full bg-[#ECE9F3] text-[#3A3350] font-hand text-[24px] flex items-center justify-center cursor-pointer hover:brightness-95 active:translate-y-[1px] transition-all shrink-0"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
