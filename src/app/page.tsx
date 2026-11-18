"use client";

import { useState } from "react";
import { initialBooks } from "@/data/books";

// 주제별 귀여운 색상 및 이모지 매핑
const categoryStyles: Record<string, { bg: string; text: string; border: string; icon: string }> = {
  동물: { bg: "bg-amber-100", text: "text-amber-800", border: "border-amber-200", icon: "🐾" },
  가족: { bg: "bg-rose-100", text: "text-rose-800", border: "border-rose-200", icon: "🏡" },
  친구: { bg: "bg-emerald-100", text: "text-emerald-800", border: "border-emerald-200", icon: "🤝" },
  감정: { bg: "bg-purple-100", text: "text-purple-800", border: "border-purple-200", icon: "💖" },
  자연: { bg: "bg-sky-100", text: "text-sky-800", border: "border-sky-200", icon: "🌱" },
};

// 오늘 날짜를 YYYY-MM-DD 형식으로 반환
function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

// 오늘부터 N일 뒤 날짜를 YYYY-MM-DD 형식으로 반환
function daysLater(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// 빌리기 모달에서 사용할 책 정보 타입
interface BorrowTarget {
  id: number;
  title: string;
  coverEmoji: string;
  cover?: string;
}

export default function Home() {
  const [books, setBooks] = useState(initialBooks);
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
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);            // 전송 중 표시

  // ── 성공 모달 상태 ──
  const [successBook, setSuccessBook] = useState<BorrowTarget | null>(null);

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
    setIsSubmitting(false);
  };

  // 모달 닫기
  const closeBorrowModal = () => {
    setBorrowTarget(null);
    setBorrower("");
    setBorrowerError(false);
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
        alert(data.message || "저장에 실패했어요. 다시 시도해 주세요.");
        setIsSubmitting(false);
      }
    } catch {
      alert("서버와 연결할 수 없어요. 인터넷을 확인해 주세요.");
      setIsSubmitting(false);
    }
  };

  const categories = ["전체", "동물", "가족", "친구", "감정", "자연"];

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50/70 via-orange-50/30 to-amber-50/50 pb-24">
      {/* 상단 헤더 - 아이 친화적이고 단순화된 메뉴 (도서 등록은 숨김) */}
      <header className="border-b border-amber-200/60 bg-white/90 backdrop-blur-md sticky top-0 z-20 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-4xl animate-bounce">📚</span>
            <div>
              <span className="font-extrabold text-2xl text-amber-950 tracking-tight block">
                그림책 도서관
              </span>
              <span className="text-xs text-amber-700 font-medium">우리 반 독서 놀이터</span>
            </div>
          </div>

          {/* 상단 메뉴: [도서 등록]은 숨기고, 아이들이 편하게 볼 수 있는 메뉴만 유지 */}
          <nav className="flex gap-2 sm:gap-3 text-base font-bold">
            <button
              onClick={() => {
                setSelectedCategory("전체");
                setOnlyAvailable(false);
              }}
              className="px-5 py-2.5 rounded-full bg-amber-500 text-white shadow-md hover:bg-amber-600 active:scale-95 transition-all text-sm sm:text-base flex items-center gap-1.5"
            >
              <span>📖</span> 책 둘러보기
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 sm:px-6 pt-10">
        {/* 히어로 타이틀 - 만 4~5세 아이 눈높이에 맞춘 크고 따뜻한 제목 */}
        <div className="text-center space-y-4 mb-10">
          <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-amber-200/70 text-amber-900 text-base font-bold shadow-inner">
            <span className="text-xl">✨</span> 오늘은 어떤 그림책을 읽어볼까?
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight text-slate-900 drop-shadow-sm">
            우리 반 <span className="text-amber-500 underline decoration-amber-300 decoration-wavy underline-offset-8">그림책 도서관</span>
          </h1>

          <p className="text-lg sm:text-2xl text-slate-700 font-semibold max-w-xl mx-auto pt-2">
            읽고 싶은 책의 <span className="text-amber-600 font-bold bg-amber-100 px-2 py-0.5 rounded-lg">[빌리기]</span> 단추를 꾹 눌러보세요!
          </p>
        </div>

        {/* 위쪽 통계 카드 (자동 계산) */}
        <div className="grid grid-cols-3 gap-3 sm:gap-6 mb-10">
          {/* 전체 도서 */}
          <div className="bg-white p-4 sm:p-6 rounded-3xl border-2 border-amber-200 shadow-sm flex flex-col items-center text-center">
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center text-2xl sm:text-4xl mb-2 sm:mb-3 shadow-inner">
              📚
            </div>
            <h3 className="font-extrabold text-sm sm:text-lg text-slate-700">보유 도서</h3>
            <p className="text-xs sm:text-sm text-slate-400 font-medium">우리 반 전체 책</p>
            <div className="text-2xl sm:text-4xl font-black text-amber-600 mt-1 sm:mt-2">
              {totalBooksCount}<span className="text-sm sm:text-xl font-bold ml-0.5">권</span>
            </div>
          </div>

          {/* 대여 가능 */}
          <div className="bg-white p-4 sm:p-6 rounded-3xl border-2 border-emerald-200 shadow-sm flex flex-col items-center text-center">
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center text-2xl sm:text-4xl mb-2 sm:mb-3 shadow-inner">
              🟢
            </div>
            <h3 className="font-extrabold text-sm sm:text-lg text-slate-700">대여 가능</h3>
            <p className="text-xs sm:text-sm text-slate-400 font-medium">지금 읽을 수 있어요</p>
            <div className="text-2xl sm:text-4xl font-black text-emerald-600 mt-1 sm:mt-2">
              {availableBooksCount}<span className="text-sm sm:text-xl font-bold ml-0.5">권</span>
            </div>
          </div>

          {/* 대여 중 */}
          <div className="bg-white p-4 sm:p-6 rounded-3xl border-2 border-orange-200 shadow-sm flex flex-col items-center text-center">
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-orange-100 text-orange-800 flex items-center justify-center text-2xl sm:text-4xl mb-2 sm:mb-3 shadow-inner">
              📖
            </div>
            <h3 className="font-extrabold text-sm sm:text-lg text-slate-700">대여 중</h3>
            <p className="text-xs sm:text-sm text-slate-400 font-medium">친구들이 읽는 중</p>
            <div className="text-2xl sm:text-4xl font-black text-orange-500 mt-1 sm:mt-2">
              {borrowedBooksCount}<span className="text-sm sm:text-xl font-bold ml-0.5">권</span>
            </div>
          </div>
        </div>

        {/* 큰 주제 필터 버튼 & "빌릴 수 있는 책만 보기" 체크 상자 */}
        <div className="mb-8 space-y-4">
          {/* 주제 버튼들 */}
          <div className="flex items-center justify-center gap-2 sm:gap-3 flex-wrap">
            {categories.map((cat) => {
              const isSelected = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-5 py-3 rounded-2xl text-base sm:text-lg font-black transition-all shadow-sm active:scale-95 ${
                    isSelected
                      ? "bg-amber-600 text-white shadow-amber-200 shadow-md ring-4 ring-amber-300"
                      : "bg-white text-slate-700 border-2 border-amber-100 hover:bg-amber-50"
                  }`}
                >
                  {cat === "전체" ? "🌈 전체" : `${categoryStyles[cat]?.icon || ""} ${cat}`}
                </button>
              );
            })}
          </div>

          {/* "빌릴 수 있는 책만 보기" 체크 상자 */}
          <div className="flex items-center justify-center pt-1">
            <label
              htmlFor="only-available"
              className={`inline-flex items-center gap-3 px-6 py-3 rounded-2xl border-2 shadow-sm cursor-pointer active:scale-95 transition-all select-none ${
                onlyAvailable
                  ? "bg-emerald-50 border-emerald-400 ring-2 ring-emerald-200"
                  : "bg-white border-slate-200 hover:border-emerald-300"
              }`}
            >
              <input
                id="only-available"
                type="checkbox"
                checked={onlyAvailable}
                onChange={(e) => setOnlyAvailable(e.target.checked)}
                className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600 rounded-lg border-2 border-slate-300 focus:ring-emerald-500 cursor-pointer accent-emerald-600"
              />
              <span className="text-base sm:text-lg font-extrabold text-slate-800 flex items-center gap-1.5">
                <span>🟢</span> 빌릴 수 있는 책만 보기
              </span>
            </label>
          </div>
        </div>

        {/* 태블릿용 큼직한 책 카드 목록 (만 4~5세 아이 눈높이) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          {filteredBooks.map((book) => {
            const isAvailable = book.availableCount > 0;
            const categoryStyle = categoryStyles[book.category] || {
              bg: "bg-slate-100",
              text: "text-slate-700",
              border: "border-slate-200",
              icon: "🏷️",
            };

            // cover 이미지가 있고 로드 실패하지 않은 경우 이미지 표시, 실패 또는 없으면 이모지 폴백
            const hasValidCover = Boolean(book.cover) && !failedImages[book.id];

            return (
              <div
                key={book.id}
                className="bg-white rounded-3xl p-6 border-2 border-amber-200/70 shadow-md hover:shadow-xl transition-all flex flex-col justify-between relative overflow-hidden group"
              >
                {/* 상단: 주제 배지 & 남은 권수 배지 */}
                <div className="flex items-center justify-between mb-4">
                  <span
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-extrabold border ${categoryStyle.bg} ${categoryStyle.text} ${categoryStyle.border}`}
                  >
                    <span>{categoryStyle.icon}</span>
                    <span>{book.category}</span>
                  </span>

                  <span
                    className={`inline-flex items-center px-3.5 py-1.5 rounded-full text-sm font-black ${
                      isAvailable
                        ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                        : "bg-slate-100 text-slate-500 border border-slate-200"
                    }`}
                  >
                    {isAvailable ? `남은 책 ${book.availableCount}권` : "다 빌려갔어요"}
                  </span>
                </div>

                {/* 중앙: 3:4 세로 비율 실제 표지 이미지 또는 이모지 폴백 */}
                <div className="text-center my-4 flex flex-col items-center">
                  <div className="w-full flex items-center justify-center mb-4">
                    {hasValidCover ? (
                      <div className="w-48 aspect-[3/4] rounded-2xl bg-slate-50 border-2 border-amber-100/80 shadow-md p-1.5 flex items-center justify-center overflow-hidden group-hover:scale-105 transition-transform duration-200">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={book.cover}
                          alt={book.title}
                          referrerPolicy="no-referrer"
                          onError={() => {
                            setFailedImages((prev) => ({ ...prev, [book.id]: true }));
                          }}
                          className="w-full h-full object-contain rounded-xl"
                        />
                      </div>
                    ) : (
                      <div className="w-48 aspect-[3/4] rounded-2xl bg-amber-50 border-2 border-amber-100 flex flex-col items-center justify-center shadow-inner group-hover:scale-105 transition-transform duration-200">
                        <span className="text-7xl sm:text-8xl select-none">{book.coverEmoji}</span>
                        <span className="text-xs text-amber-700 font-bold mt-2 bg-amber-100/80 px-2.5 py-1 rounded-full">
                          그림책
                        </span>
                      </div>
                    )}
                  </div>

                  <h2 className="text-2xl sm:text-3xl font-black text-slate-900 leading-snug tracking-tight mb-2 px-2">
                    {book.title}
                  </h2>

                  <p className="text-base text-slate-500 font-medium">
                    {book.author} 글·그림
                  </p>
                </div>

                {/* 하단: 태블릿용 크고 누르기 쉬운 [빌리기] 버튼 */}
                <div className="pt-2">
                  <button
                    onClick={() => handleBorrowClick(book.id)}
                    disabled={!isAvailable}
                    className={`w-full py-4 sm:py-5 rounded-2xl text-xl sm:text-2xl font-black shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 ${
                      isAvailable
                        ? "bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white shadow-amber-200 cursor-pointer"
                        : "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                    }`}
                  >
                    {isAvailable ? (
                      <>
                        <span className="text-2xl">🖐️</span>
                        <span>빌리기</span>
                      </>
                    ) : (
                      <span>친구 읽는 중</span>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* 결과가 없을 때 크게 보여주는 안내 영역 */}
        {filteredBooks.length === 0 && (
          <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-amber-200 mt-6 space-y-4">
            <span className="text-7xl sm:text-8xl block animate-pulse">🔍</span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-slate-800">
              찾는 책이 없어요
            </h2>
            <p className="text-lg sm:text-xl text-slate-500 font-semibold max-w-md mx-auto">
              다른 주제를 누르거나 &lsquo;빌릴 수 있는 책만 보기&rsquo;를 풀어보세요.
            </p>
            <div className="pt-2">
              <button
                onClick={() => {
                  setSelectedCategory("전체");
                  setOnlyAvailable(false);
                  setSearchQuery("");
                }}
                className="px-8 py-4 bg-amber-500 text-white text-xl font-black rounded-2xl shadow-lg shadow-amber-200 hover:bg-amber-600 active:scale-95 transition-all"
              >
                모든 책 다시 보기
              </button>
            </div>
          </div>
        )}
      </main>

      {/* ── 빌리기 입력 모달 ── */}
      {borrowTarget && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full border-4 border-amber-300 shadow-2xl space-y-5">
            {/* 책 표지 + 제목 */}
            <div className="text-center space-y-3">
              <div className="flex justify-center">
                {borrowTarget.cover ? (
                  <div className="w-28 aspect-[3/4] rounded-2xl bg-slate-50 border-2 border-amber-200 shadow-md p-1 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={borrowTarget.cover}
                      alt={borrowTarget.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-contain rounded-xl"
                    />
                  </div>
                ) : (
                  <div className="text-7xl">{borrowTarget.coverEmoji}</div>
                )}
              </div>
              <h3 className="text-2xl sm:text-3xl font-black text-slate-900">
                &lsquo;{borrowTarget.title}&rsquo;
              </h3>
              <p className="text-base text-slate-500 font-bold">이 책을 빌릴 거예요!</p>
            </div>

            {/* 친구 번호/별명 입력 */}
            <div className="space-y-2">
              <label htmlFor="borrower-input" className="block text-lg font-extrabold text-slate-800">
                🏷️ 친구 번호 또는 별명
              </label>
              <p className="text-sm text-slate-500 font-semibold bg-amber-50 rounded-xl px-3 py-2 border border-amber-200">
                💡 이름 대신 번호나 별명을 써요
              </p>
              <input
                id="borrower-input"
                type="text"
                value={borrower}
                onChange={(e) => {
                  setBorrower(e.target.value);
                  if (e.target.value.trim() !== "") setBorrowerError(false);
                }}
                placeholder="예: 7번, 토끼, 별님"
                className={`w-full px-5 py-4 text-lg sm:text-xl font-bold rounded-2xl border-2 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 transition-all ${
                  borrowerError
                    ? "border-red-400 focus:ring-red-300 bg-red-50"
                    : "border-amber-200 focus:ring-amber-400"
                }`}
              />
              {borrowerError && (
                <p className="text-base font-extrabold text-red-600 flex items-center gap-1.5 pt-1">
                  <span>⚠️</span> 번호나 별명을 써주세요
                </p>
              )}
            </div>

            {/* 반납 예정일 */}
            <div className="space-y-2">
              <label htmlFor="return-date-input" className="block text-lg font-extrabold text-slate-800">
                📅 반납 예정일
              </label>
              <input
                id="return-date-input"
                type="date"
                value={returnDate}
                min={todayString()}
                onChange={(e) => setReturnDate(e.target.value)}
                className="w-full px-5 py-4 text-lg sm:text-xl font-bold rounded-2xl border-2 border-amber-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-400 transition-all"
              />
            </div>

            {/* 버튼 영역 */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={closeBorrowModal}
                disabled={isSubmitting}
                className="flex-1 py-4 rounded-2xl text-lg sm:text-xl font-black bg-slate-100 text-slate-600 border-2 border-slate-200 hover:bg-slate-200 active:scale-95 transition-all"
              >
                취소
              </button>
              <button
                onClick={handleSubmitBorrow}
                disabled={isSubmitting}
                className="flex-[2] py-4 rounded-2xl text-lg sm:text-xl font-black bg-amber-500 text-white shadow-lg shadow-amber-200 hover:bg-amber-600 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <span>보내는 중...</span>
                ) : (
                  <>
                    <span>🖐️</span>
                    <span>빌리기 확인</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 성공 축하 모달 ── */}
      {successBook && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full border-4 border-amber-300 shadow-2xl text-center space-y-6">
            <div className="flex justify-center">
              {successBook.cover ? (
                <div className="w-36 aspect-[3/4] rounded-2xl bg-slate-50 border-2 border-amber-200 shadow-md p-1 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={successBook.cover}
                    alt={successBook.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain rounded-xl"
                  />
                </div>
              ) : (
                <div className="text-8xl animate-bounce">{successBook.coverEmoji}</div>
              )}
            </div>
            <div className="space-y-2">
              <span className="inline-block px-4 py-1.5 rounded-full bg-emerald-100 text-emerald-800 font-extrabold text-sm">
                빌렸어요! 🎉
              </span>
              <h3 className="text-3xl font-black text-slate-900">
                &lsquo;{successBook.title}&rsquo;
              </h3>
              <p className="text-lg text-slate-600 font-bold">
                책을 빌렸어요! 재미있게 읽고 제자리에 돌려주세요.
              </p>
            </div>
            <button
              onClick={() => setSuccessBook(null)}
              className="w-full py-4 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl text-2xl font-black shadow-lg shadow-amber-200 active:scale-95 transition-all"
            >
              고마워요! 👍
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
