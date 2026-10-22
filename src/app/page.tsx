"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import confetti from "canvas-confetti";

// 색상 정의
type BrickColorKey =
  | "lightRed"
  | "lightOrange"
  | "lightYellow"
  | "lightBlue"
  | "lightGreen"
  | "lightPurple";

interface BrickColorInfo {
  name: string;
  fill: string;
  stroke: string;
  isRed?: boolean;
}

const BRICK_COLORS: Record<BrickColorKey, BrickColorInfo> = {
  lightRed: { name: "연한 빨강", fill: "#fca5a5", stroke: "#ef4444", isRed: true },
  lightOrange: { name: "연한 주황", fill: "#fed7aa", stroke: "#f97316" },
  lightYellow: { name: "연한 노랑", fill: "#fef08a", stroke: "#eab308" },
  lightBlue: { name: "연한 파랑", fill: "#bae6fd", stroke: "#0ea5e9" },
  lightGreen: { name: "연한 녹색", fill: "#bbf7d0", stroke: "#22c55e" },
  lightPurple: { name: "연한 보라", fill: "#e9d5ff", stroke: "#a855f7" },
};

const OTHER_COLOR_KEYS: BrickColorKey[] = [
  "lightOrange",
  "lightYellow",
  "lightBlue",
  "lightGreen",
  "lightPurple",
];

interface Brick {
  id: number;
  row: number;
  col: number;
  x: number;
  y: number;
  w: number;
  h: number;
  colorKey: BrickColorKey;
  isDestroyed: boolean;
}

interface ScoreRecord {
  id: string;
  name: string;
  timeStr: string;
  seconds: number;
  createdAt: string;
}

interface Particle {
  x: number;
  y: number;
  vy: number;
  alpha: number;
  size: number;
  text: string;
}

export default function GamePage() {
  // 화면 모드: 'start' (첫 페이지) | 'game' (게임 화면)
  const [screen, setScreen] = useState<"start" | "game">("start");

  // 사용자 입력 및 제작자 정보
  const [playerName, setPlayerName] = useState("");
  const [dept, setDept] = useState("생명과학전공");
  const [studentId, setStudentId] = useState("202602306");
  const [authorName, setAuthorName] = useState("우아연");
  const [isEditingAuthor, setIsEditingAuthor] = useState(false);

  // 구글 시트 웹앱 URL (환경변수 또는 기본 배포 URL fallback 적용으로 Vercel에서도 즉시 동작)
  const DEFAULT_SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbwNFm57F3v8RyXFVKfITtJqpk36H3zKfk1V82i36MtyfkV0mZCNHSYaQt4eZCclfhG8/exec";

  const [googleSheetUrl, setGoogleSheetUrl] = useState(
    process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL || DEFAULT_SCRIPT_URL
  );
  const [showSettings, setShowSettings] = useState(false);

  // 게임 상태: 'ready' (3,2,1 카운트다운) | 'playing' | 'paused' | 'cleared' | 'failed'
  const [gameState, setGameState] = useState<
    "ready" | "playing" | "paused" | "cleared" | "failed"
  >("ready");

  const [countdown, setCountdown] = useState<number | null>(null);
  const [lives, setLives] = useState(3);
  const [redClearedCount, setRedClearedCount] = useState(0);
  const [totalRedCount, setTotalRedCount] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [finalTimeStr, setFinalTimeStr] = useState("");
  const [gameStartTime, setGameStartTime] = useState<string>("");
  const [isSavedToSheet, setIsSavedToSheet] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // 랭킹 Top3
  const [leaderboard, setLeaderboard] = useState<ScoreRecord[]>([]);

  // 캔버스 및 오디오 ref
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // 애니메이션 프레임 & 키보드 상태
  const animFrameId = useRef<number | null>(null);
  const keysPressed = useRef<{ left: boolean; right: boolean }>({
    left: false,
    right: false,
  });

  // 게임 물리 상태 (ref로 관리하여 렌더링 딜레이 제거)
  const gameRef = useRef<{
    width: number;
    height: number;
    paddle: { x: number; y: number; w: number; h: number; speed: number };
    ball: {
      x: number;
      y: number;
      radius: number;
      dx: number;
      dy: number;
      speed: number;
    };
    bricks: Brick[];
    particles: Particle[];
    lives: number;
    redRemoved: number;
    totalRed: number;
    state: "ready" | "playing" | "paused" | "cleared" | "failed";
  }>({
    width: 640,
    height: 520,
    paddle: { x: 260, y: 480, w: 120, h: 14, speed: 8 },
    ball: { x: 320, y: 460, radius: 9, dx: 4, dy: -4, speed: 5.5 },
    bricks: [],
    particles: [],
    lives: 3,
    redRemoved: 0,
    totalRed: 0,
    state: "ready",
  });

  // 로컬 스토리지에서 랭킹 및 제작자 정보 불러오기
  useEffect(() => {
    const savedScores = localStorage.getItem("inu_brick_scores");
    if (savedScores) {
      try {
        setLeaderboard(JSON.parse(savedScores));
      } catch (e) {
        console.error(e);
      }
    }
    const savedAuthor = localStorage.getItem("inu_author_info");
    if (savedAuthor) {
      try {
        const parsed = JSON.parse(savedAuthor);
        if (parsed.dept) setDept(parsed.dept);
        if (parsed.studentId) setStudentId(parsed.studentId);
        if (parsed.authorName) setAuthorName(parsed.authorName);
      } catch (e) {
        console.error(e);
      }
    }
    const savedUrl = localStorage.getItem("inu_gsheet_url");
    if (savedUrl) setGoogleSheetUrl(savedUrl);
  }, []);

  const saveAuthorInfo = () => {
    localStorage.setItem(
      "inu_author_info",
      JSON.stringify({ dept, studentId, authorName })
    );
    setIsEditingAuthor(false);
  };

  // Web Audio API 충돌 효과음 (블록 충돌 시 더 크고 선명하게 재생)
  const playHitSound = useCallback(
    (
      frequency = 480,
      duration = 0.08,
      volume = 0.35,
      type: OscillatorType = "triangle"
    ) => {
      try {
        if (!audioContextRef.current) {
          const AudioCtx =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext })
              .webkitAudioContext;
          audioContextRef.current = new AudioCtx();
        }
        const ctx = audioContextRef.current;
        if (ctx.state === "suspended") {
          ctx.resume();
        }
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(frequency, ctx.currentTime);
        // 볼륨 Envelope 설정
        gain.gain.setValueAtTime(volume, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(
          0.001,
          ctx.currentTime + duration
        );
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + duration);
      } catch (e) {
        console.log("Audio play error", e);
      }
    },
    []
  );

  // 분:초 포맷팅 함수
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  // 벽돌 5행 x 8열 생성 (전체의 30%인 12개를 연한 빨강으로 고정 배치, 나머지는 5색상 랜덤)
  const createBricks = (): Brick[] => {
    const rows = 5;
    const cols = 8;
    const total = rows * cols; // 40개
    const redCount = Math.round(total * 0.3); // 12개

    // 빨강 12개, 나머지 색상들 랜덤 28개
    const colors: BrickColorKey[] = [];
    for (let i = 0; i < redCount; i++) {
      colors.push("lightRed");
    }
    for (let i = redCount; i < total; i++) {
      const randIdx = Math.floor(Math.random() * OTHER_COLOR_KEYS.length);
      colors.push(OTHER_COLOR_KEYS[randIdx]);
    }
    // 셔플
    for (let i = colors.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [colors[i], colors[j]] = [colors[j], colors[i]];
    }

    const padding = 6;
    const topOffset = 45;
    const sideOffset = 18;
    const availableWidth = 640 - sideOffset * 2;
    const brickW = (availableWidth - padding * (cols - 1)) / cols;
    const brickH = 22;

    const bricks: Brick[] = [];
    let idx = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        bricks.push({
          id: idx,
          row: r,
          col: c,
          x: sideOffset + c * (brickW + padding),
          y: topOffset + r * (brickH + padding),
          w: brickW,
          h: brickH,
          colorKey: colors[idx],
          isDestroyed: false,
        });
        idx++;
      }
    }
    return bricks;
  };

  // 게임 시작 (첫 페이지 -> 게임 화면)
  const handleStartGame = () => {
    if (!playerName.trim()) {
      alert("사용자 이름을 입력해 주세요!");
      return;
    }

    const newBricks = createBricks();
    const redCount = newBricks.filter((b) => b.colorKey === "lightRed").length;

    gameRef.current = {
      width: 640,
      height: 520,
      paddle: { x: 260, y: 480, w: 120, h: 14, speed: 8 },
      ball: { x: 320, y: 460, radius: 9, dx: 0, dy: 0, speed: 5.5 },
      bricks: newBricks,
      particles: [],
      lives: 3,
      redRemoved: 0,
      totalRed: redCount,
      state: "ready",
    };

    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, "0");
    const startTimeStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
      now.getDate()
    )} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    setGameStartTime(startTimeStr);
    setIsSavedToSheet(false);
    setIsSaving(false);

    setLives(3);
    setRedClearedCount(0);
    setTotalRedCount(redCount);
    setElapsedSeconds(0);
    setFinalTimeStr("");
    setGameState("ready");
    setScreen("game");

    // 배경음악 준비 및 재생 (볼륨 너무 크지 않게 0.25)
    if (audioRef.current) {
      audioRef.current.volume = 0.25;
      audioRef.current.currentTime = 0;
      audioRef.current
        .play()
        .catch((e) => console.log("BGM autoplay policy:", e));
    }

    // 3, 2, 1 카운트다운 시작
    setCountdown(3);
  };

  // 카운트다운 타이머
  useEffect(() => {
    if (countdown === null) return;
    if (countdown > 0) {
      playHitSound(350, 0.1);
      const timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0) {
      playHitSound(600, 0.2);
      setCountdown(null);
      // 공 발사 시작 (랜덤한 약간의 x방향 각도)
      const angle = (Math.random() * 0.6 - 0.3) * Math.PI; // -54도 ~ +54도
      const speed = gameRef.current.ball.speed;
      gameRef.current.ball.dx = speed * Math.sin(angle) || 3.5;
      gameRef.current.ball.dy = -Math.abs(speed * Math.cos(angle)) || -4.5;
      gameRef.current.state = "playing";
      setGameState("playing");
    }
  }, [countdown, playHitSound]);

  // 플레이 중 경과 시간 타이머 (분:초)
  useEffect(() => {
    if (gameState !== "playing") return;
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [gameState]);

  // 일시정지 / 계속하기 토글
  const togglePause = () => {
    if (gameState === "playing") {
      gameRef.current.state = "paused";
      setGameState("paused");
      if (audioRef.current) audioRef.current.pause();
    } else if (gameState === "paused") {
      gameRef.current.state = "playing";
      setGameState("playing");
      if (audioRef.current) audioRef.current.play();
    }
  };

  // 다시 시작 (이름 작성하는 첫 화면으로 이동)
  const handleRestart = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setGameState("ready");
    setCountdown(null);
    setScreen("start");
  };

  // 게임 종료 버튼 (홈 화면으로 이동 및 상태 리셋)
  const handleExitGame = () => {
    if (confirm("정말 게임을 종료하시겠습니까?")) {
      handleRestart();
    }
  };

  // 미션 클리어 처리
  const handleMissionSuccess = useCallback(
    (finishedSecs: number) => {
      gameRef.current.state = "cleared";
      setGameState("cleared");

      const timeFormatted = formatTime(finishedSecs);
      setFinalTimeStr(timeFormatted);

      // 화려한 폭죽 효과
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 },
      });
      setTimeout(() => {
        confetti({
          particleCount: 80,
          angle: 60,
          spread: 60,
          origin: { x: 0 },
        });
        confetti({
          particleCount: 80,
          angle: 120,
          spread: 60,
          origin: { x: 1 },
        });
      }, 350);

      // 1. 로컬 랭킹 즉시 반영
      const newRecord: ScoreRecord = {
        id: Date.now().toString(),
        name: playerName,
        timeStr: timeFormatted,
        seconds: finishedSecs,
        createdAt: new Date().toLocaleDateString(),
      };

      const localUpdated = [...leaderboard, newRecord]
        .sort((a, b) => a.seconds - b.seconds)
        .slice(0, 3);
      setLeaderboard(localUpdated);
      localStorage.setItem("inu_brick_scores", JSON.stringify(localUpdated));

      // 2. 구글 스프레드시트에 자동 저장 (CREATE) & 최신 Top 3 동기화 (READ)
      const sheetUrl =
        googleSheetUrl ||
        process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL ||
        localStorage.getItem("inu_gsheet_url");

      if (sheetUrl && sheetUrl.startsWith("http")) {
        setIsSaving(true);
        fetch(sheetUrl, {
          method: "POST",
          mode: "no-cors",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "create",
            timestamp: gameStartTime,
            name: playerName,
            finishtime: timeFormatted,
          }),
        })
          .then(() => {
            setIsSavedToSheet(true);
            setIsSaving(false);
            // 저장 후 1초 뒤 구글 시트에서 최신 Top 3 읽어와서 동기화
            setTimeout(() => {
              fetchGoogleSheetData();
            }, 1200);
          })
          .catch((err) => {
            console.error("Auto save to Google Sheets error:", err);
            setIsSaving(false);
          });
      }
    },
    [playerName, leaderboard, gameStartTime, googleSheetUrl]
  );

  // [구글 시트 READ] 랭킹 및 데이터 읽어오기
  const fetchGoogleSheetData = useCallback(async () => {
    const sheetUrl =
      googleSheetUrl ||
      process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL ||
      localStorage.getItem("inu_gsheet_url");
    if (!sheetUrl || !sheetUrl.startsWith("http")) return;

    try {
      const res = await fetch(`${sheetUrl}?action=read`);
      const result = await res.json();
      if (result.status === "success" && Array.isArray(result.top3)) {
        const mappedTop3: ScoreRecord[] = result.top3.map(
          (item: { rowId: number; name: string; finishtime: string; seconds: number; timestamp: string }) => {
            // 구글 시트에서 계산된 순수 소요 초(seconds)를 기반으로 정확한 mm:ss (분:초) 계산
            let formattedTime = "00:00";
            if (typeof item.seconds === "number" && !isNaN(item.seconds)) {
              const m = Math.floor(item.seconds / 60).toString().padStart(2, "0");
              const s = (item.seconds % 60).toString().padStart(2, "0");
              formattedTime = `${m}:${s}`;
            } else {
              // 00:00 형식 정규식 매칭
              const match = String(item.finishtime || "").match(/(\d{1,2}):(\d{2})/);
              if (match) {
                formattedTime = `${match[1].padStart(2, "0")}:${match[2]}`;
              } else {
                formattedTime = "00:00";
              }
            }

            return {
              id: String(item.rowId),
              name: item.name,
              timeStr: formattedTime,
              seconds: item.seconds,
              createdAt: item.timestamp,
            };
          }
        );
        if (mappedTop3.length > 0) {
          setLeaderboard(mappedTop3);
          localStorage.setItem("inu_brick_scores", JSON.stringify(mappedTop3));
        }
      }
    } catch (err) {
      console.log("Failed to fetch Google Sheet data:", err);
    }
  }, [googleSheetUrl]);

  // 페이지 진입 시 자동으로 구글 시트에서 Top3 랭킹 읽기(READ)
  useEffect(() => {
    fetchGoogleSheetData();
  }, [fetchGoogleSheetData]);

  // [저장] 버튼 클릭 핸들러: 구글 스프레드시트에 등록(CREATE) 및 최신 데이터 읽기(READ)
  const handleSaveToGoogleSheet = async () => {
    const sheetUrl =
      googleSheetUrl ||
      process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL ||
      localStorage.getItem("inu_gsheet_url");

    if (!sheetUrl || !sheetUrl.startsWith("http")) {
      alert(
        ".env.local의 NEXT_PUBLIC_GOOGLE_SCRIPT_URL이 비어 있습니다. 웹 앱 URL을 등록해 주세요!"
      );
      return;
    }

    try {
      setIsSaving(true);
      // POST 요청: timestamp(시작일시), name(이름), finishtime(완료시간)
      await fetch(sheetUrl, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          timestamp: gameStartTime,
          name: playerName,
          finishtime: finalTimeStr,
        }),
      });

      setIsSavedToSheet(true);
      alert("✅ 구글 스프레드시트에 성공적으로 저장되었습니다!");

      // 저장 후 최신 시트 데이터 읽기(READ) 동기화
      setTimeout(() => {
        fetchGoogleSheetData();
      }, 1000);
    } catch (err) {
      console.error(err);
      alert("구글 시트 저장 중 오류가 발생했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  // 미션 실패 처리
  const handleMissionFailed = useCallback(() => {
    gameRef.current.state = "failed";
    setGameState("failed");
    if (audioRef.current) {
      audioRef.current.pause();
    }
    playHitSound(180, 0.4);
  }, [playHitSound]);

  // 키보드 이벤트 핸들러 (좌우 방향키)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "Left") {
        keysPressed.current.left = true;
      } else if (e.key === "ArrowRight" || e.key === "Right") {
        keysPressed.current.right = true;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "Left") {
        keysPressed.current.left = false;
      } else if (e.key === "ArrowRight" || e.key === "Right") {
        keysPressed.current.right = false;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // 모바일 터치 / 스와이프 핸들러 (반응형 캔버스 비율 반영 및 화면 스와이프 완벽 지원)
  const touchStartX = useRef<number | null>(null);

  const updatePaddleByTouch = useCallback((clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0) return;

    // 모바일 캔버스 실제 표시 너비 대비 내부 해상도(640px) 비율 계산
    const scaleX = gameRef.current.width / rect.width;
    const touchCanvasX = (clientX - rect.left) * scaleX;

    // 패들의 중심이 손가락 위치에 부드럽게 오도록 이동
    const paddle = gameRef.current.paddle;
    const targetX = touchCanvasX - paddle.w / 2;
    paddle.x = Math.max(0, Math.min(gameRef.current.width - paddle.w, targetX));
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length > 0) {
      touchStartX.current = e.touches[0].clientX;
      updatePaddleByTouch(e.touches[0].clientX);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length > 0) {
      updatePaddleByTouch(e.touches[0].clientX);
    }
  };

  const handleTouchEnd = () => {
    touchStartX.current = null;
  };

  // 메인 게임 루프 (Canvas Rendering & Physics)
  useEffect(() => {
    if (screen !== "game") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let localFrameId: number;

    const render = () => {
      const g = gameRef.current;
      const { paddle, ball, bricks } = g;

      // 1. 패들 이동 (PC 방향키)
      if (g.state === "playing") {
        if (keysPressed.current.left) {
          paddle.x = Math.max(0, paddle.x - paddle.speed);
        }
        if (keysPressed.current.right) {
          paddle.x = Math.min(g.width - paddle.w, paddle.x + paddle.speed);
        }

        // 2. 공 이동
        ball.x += ball.dx;
        ball.y += ball.dy;

        // 좌우 벽 충돌
        if (ball.x - ball.radius <= 0) {
          ball.x = ball.radius;
          ball.dx = Math.abs(ball.dx);
          playHitSound(300, 0.05);
        } else if (ball.x + ball.radius >= g.width) {
          ball.x = g.width - ball.radius;
          ball.dx = -Math.abs(ball.dx);
          playHitSound(300, 0.05);
        }

        // 상단 벽 충돌
        if (ball.y - ball.radius <= 0) {
          ball.y = ball.radius;
          ball.dy = Math.abs(ball.dy);
          playHitSound(320, 0.05);
        }

        // 패들 충돌
        if (
          ball.y + ball.radius >= paddle.y &&
          ball.y - ball.radius <= paddle.y + paddle.h &&
          ball.x >= paddle.x - ball.radius &&
          ball.x <= paddle.x + paddle.w + ball.radius
        ) {
          ball.y = paddle.y - ball.radius;
          // 충돌 위치에 따른 반사각 계산
          const hitPos = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2); // -1 ~ 1
          const maxAngle = (Math.PI / 3) * 0.85; // 약 50도
          const currentSpeed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
          ball.dx = currentSpeed * Math.sin(hitPos * maxAngle);
          ball.dy = -currentSpeed * Math.cos(hitPos * maxAngle);
          playHitSound(520, 0.07);
        }

        // 하단으로 떨어진 경우 (생명 감소 또는 게임 오버)
        if (ball.y - ball.radius > g.height) {
          g.lives -= 1;
          setLives(g.lives);
          if (g.lives <= 0) {
            handleMissionFailed();
          } else {
            // 공 & 패들 위치 리셋
            paddle.x = (g.width - paddle.w) / 2;
            ball.x = g.width / 2;
            ball.y = paddle.y - ball.radius - 2;
            ball.dx = 0;
            ball.dy = 0;
            g.state = "ready";
            setGameState("ready");
            setCountdown(3);
          }
        }

        // 벽돌 충돌 검사
        for (let i = 0; i < bricks.length; i++) {
          const b = bricks[i];
          if (b.isDestroyed) continue;

          // AABB + 원 충돌 검사
          const closestX = Math.max(b.x, Math.min(ball.x, b.x + b.w));
          const closestY = Math.max(b.y, Math.min(ball.y, b.y + b.h));
          const distanceX = ball.x - closestX;
          const distanceY = ball.y - closestY;
          const distanceSquared = distanceX * distanceX + distanceY * distanceY;

          if (distanceSquared < ball.radius * ball.radius) {
            b.isDestroyed = true;
            // 블록 충돌 시 볼륨 0.55, 선명한 삼각파(triangle) 사운드로 확실한 타격감 부여
            playHitSound(
              b.colorKey === "lightRed" ? 920 : 800,
              0.1,
              0.55,
              "triangle"
            );

            // 반사 방향 판단
            const prevX = ball.x - ball.dx;
            const prevY = ball.y - ball.dy;
            if (prevX <= b.x || prevX >= b.x + b.w) {
              ball.dx = -ball.dx;
            } else {
              ball.dy = -ball.dy;
            }

            // 조건: 연한 빨강색 블록 세 개 제거 시 승리 종료 + 엄지손가락 이모티콘 파티클 생성
            if (b.colorKey === "lightRed") {
              g.redRemoved += 1;
              setRedClearedCount(g.redRemoved);

              // 💥 빨간 블록 위치에서 위로 떠오르는 엄지손가락(👍) 이모티콘 3개 방출
              for (let p = 0; p < 3; p++) {
                g.particles.push({
                  x: b.x + b.w / 2 + (p - 1) * 14,
                  y: b.y + b.h / 2,
                  vy: -2.0 - Math.random() * 1.5,
                  alpha: 1.0,
                  size: 26,
                  text: "👍",
                });
              }

              if (g.redRemoved >= 3) {
                // 경과시간 캡처하여 승리 처리
                const currentSecs = elapsedSeconds;
                handleMissionSuccess(currentSecs);
                break;
              }
            }
            break;
          }
        }
      }

      // 3. 화면 그리기 (밝고 세련된 소프트 블루/아이보리 배경)
      ctx.clearRect(0, 0, g.width, g.height);

      // 밝은 배경 그라데이션
      const bgGrad = ctx.createLinearGradient(0, 0, 0, g.height);
      bgGrad.addColorStop(0, "#f8fafc"); // slate-50
      bgGrad.addColorStop(1, "#e2e8f0"); // slate-200
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, g.width, g.height);

      // 은은한 밝은 격자 무늬
      ctx.strokeStyle = "rgba(148, 163, 184, 0.25)"; // slate-400
      ctx.lineWidth = 1;
      for (let x = 0; x < g.width; x += 30) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, g.height);
        ctx.stroke();
      }

      // 벽돌 그리기
      bricks.forEach((b) => {
        if (b.isDestroyed) return;
        const color = BRICK_COLORS[b.colorKey];

        // 둥근 사각형 벽돌
        const r = 4;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(b.x + r, b.y);
        ctx.lineTo(b.x + b.w - r, b.y);
        ctx.quadraticCurveTo(b.x + b.w, b.y, b.x + b.w, b.y + r);
        ctx.lineTo(b.x + b.w, b.y + b.h - r);
        ctx.quadraticCurveTo(b.x + b.w, b.y + b.h, b.x + b.w - r, b.y + b.h);
        ctx.lineTo(b.x + r, b.y + b.h);
        ctx.quadraticCurveTo(b.x, b.y + b.h, b.x, b.y + b.h - r);
        ctx.lineTo(b.x, b.y + r);
        ctx.quadraticCurveTo(b.x, b.y, b.x + r, b.y);
        ctx.closePath();

        ctx.fillStyle = color.fill;
        ctx.fill();
        ctx.strokeStyle = color.stroke;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // 연한 빨강은 목표 블록임을 눈에 띄게 테두리 및 별 표시
        if (b.colorKey === "lightRed") {
          ctx.fillStyle = "#ef4444";
          ctx.beginPath();
          ctx.arc(b.x + b.w / 2, b.y + b.h / 2, 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      });

      // 패들 그리기 (INU 시그니처 로얄블루 + 선명한 엣지)
      ctx.save();
      ctx.fillStyle = "#1d4ed8";
      ctx.shadowColor = "rgba(37, 99, 235, 0.4)";
      ctx.shadowBlur = 8;
      const pr = 6;
      ctx.beginPath();
      ctx.moveTo(paddle.x + pr, paddle.y);
      ctx.lineTo(paddle.x + paddle.w - pr, paddle.y);
      ctx.quadraticCurveTo(
        paddle.x + paddle.w,
        paddle.y,
        paddle.x + paddle.w,
        paddle.y + pr
      );
      ctx.lineTo(paddle.x + paddle.w, paddle.y + paddle.h - pr);
      ctx.quadraticCurveTo(
        paddle.x + paddle.w,
        paddle.y + paddle.h,
        paddle.x + paddle.w - pr,
        paddle.y + paddle.h
      );
      ctx.lineTo(paddle.x + pr, paddle.y + paddle.h);
      ctx.quadraticCurveTo(
        paddle.x,
        paddle.y + paddle.h,
        paddle.x,
        paddle.y + paddle.h - pr
      );
      ctx.lineTo(paddle.x, paddle.y + pr);
      ctx.quadraticCurveTo(paddle.x, paddle.y, paddle.x + pr, paddle.y);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // 공 그리기 (선명한 횃불 옐로우/오렌지 + 외곽선)
      ctx.save();
      ctx.fillStyle = "#f59e0b";
      ctx.shadowColor = "rgba(245, 158, 11, 0.5)";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#d97706";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      // 엄지손가락(👍) 파티클 애니메이션 렌더링
      for (let i = g.particles.length - 1; i >= 0; i--) {
        const pt = g.particles[i];
        pt.y += pt.vy;
        pt.alpha -= 0.02;

        if (pt.alpha <= 0) {
          g.particles.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.globalAlpha = Math.max(0, pt.alpha);
        ctx.font = `${pt.size}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(pt.text, pt.x, pt.y);
        ctx.restore();
      }

      localFrameId = requestAnimationFrame(render);
    };

    localFrameId = requestAnimationFrame(render);
    animFrameId.current = localFrameId;

    return () => {
      if (localFrameId) cancelAnimationFrame(localFrameId);
    };
  }, [screen, elapsedSeconds, handleMissionSuccess, handleMissionFailed, playHitSound]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 via-slate-50 to-indigo-50/40 text-slate-800 flex flex-col items-center justify-between p-4 selection:bg-blue-600 selection:text-white transition-colors duration-300">
      {/* 배경 음악 요소 */}
      <audio ref={audioRef} src="/Hyper_Speed_Run.mp3" loop preload="auto" />

      {/* 헤더 */}
      <header className="w-full max-w-2xl flex items-center justify-between py-2.5 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-xl font-black tracking-wider text-blue-600 dark:text-blue-400">
            INU
          </span>
          <span className="text-lg font-bold text-slate-800 dark:text-white">벽돌깨기</span>
        </div>
      </header>

      {/* 1. 첫 화면 (사용자 이름, 제작자 정보, 횃불이 마스코트, 시작 버튼) - 밝고 화사한 스타일 */}
      {screen === "start" && (
        <main className="flex-1 flex flex-col items-center justify-center max-w-md w-full my-6 text-center">
          {/* 마스코트 횃불이 이미지 */}
          <div className="relative w-48 h-48 mb-5 rounded-3xl overflow-hidden shadow-xl shadow-blue-500/10 border-2 border-blue-200 dark:border-blue-500/30 bg-white p-3">
            <Image
              src="/Mascot.jpg"
              alt="인천대학교 마스코트 횃불이"
              fill
              className="object-contain"
              priority
            />
          </div>

          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-2">
            INU 횃불이 벽돌깨기
          </h1>
          <p className="text-xs text-blue-600 dark:text-blue-300 mb-6 font-semibold">
            연한 빨강색 블록 3개를 빠르게 격파하여 미션을 완료하세요!
          </p>

          {/* 제작자 정보 카드 (수정 불가 고정) */}
          <div className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 mb-5 text-left text-xs shadow-lg shadow-slate-200/50 dark:shadow-none">
            <div className="mb-2.5">
              <span className="font-bold text-slate-500 dark:text-slate-400">
                제작자(학생) 정보
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 py-2.5 bg-slate-50 dark:bg-slate-950/60 rounded-xl px-4 border border-slate-100 dark:border-slate-800">
              <div>
                <span className="text-slate-400 dark:text-slate-500 block text-[11px] mb-0.5">학과</span>
                <span className="font-bold text-slate-800 dark:text-slate-200 text-xs sm:text-sm">{dept}</span>
              </div>
              <div>
                <span className="text-slate-400 dark:text-slate-500 block text-[11px] mb-0.5">학번</span>
                <span className="font-bold text-slate-800 dark:text-slate-200 text-xs sm:text-sm">{studentId}</span>
              </div>
              <div>
                <span className="text-slate-400 dark:text-slate-500 block text-[11px] mb-0.5">이름</span>
                <span className="font-bold text-slate-800 dark:text-slate-200 text-xs sm:text-sm">{authorName}</span>
              </div>
            </div>
          </div>

          {/* 사용자 이름 입력란 */}
          <div className="w-full space-y-2 mb-6">
            <div className="text-left text-xs font-bold text-slate-700 dark:text-slate-300">
              플레이어 닉네임 입력
            </div>
            <input
              type="text"
              placeholder="이름(닉네임)을 입력해주세요"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleStartGame();
              }}
              className="w-full bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-700 focus:border-blue-500 rounded-xl px-4 py-3 text-slate-900 dark:text-slate-100 placeholder-slate-400 outline-none transition text-sm font-semibold shadow-sm focus:shadow-md"
            />
          </div>

          {/* 게임 시작 버튼 */}
          <button
            onClick={handleStartGame}
            className="w-full py-3.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold rounded-xl shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 transition transform active:scale-95 text-base flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>🎮 게임 시작</span>
          </button>

          {/* Top 3 랭킹 */}
          {leaderboard.length > 0 && (
            <div className="w-full mt-6 bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 text-left shadow-md shadow-slate-200/50 dark:shadow-none">
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  🏆 명예의 전당 (Top 3 빠른 완료 기록)
                </h3>
                <button
                  onClick={() => {
                    fetchGoogleSheetData();
                    alert("구글 시트로부터 최신 기록을 읽어왔습니다!");
                  }}
                  title="구글 시트에서 최신 기록 새로고침 (READ)"
                  className="text-[11px] font-semibold text-blue-600 hover:text-blue-500 bg-blue-50 px-2 py-0.5 rounded cursor-pointer"
                >
                  🔄 시트 읽기
                </button>
              </div>
              <div className="space-y-1.5 text-xs">
                {leaderboard.map((item, idx) => (
                  <div
                    key={item.id}
                    className="flex justify-between items-center bg-slate-50 dark:bg-slate-950/70 px-3.5 py-2 rounded-lg border border-slate-100 dark:border-slate-800"
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`font-black w-4 text-center ${
                          idx === 0
                            ? "text-yellow-500 dark:text-yellow-400"
                            : idx === 1
                            ? "text-slate-500 dark:text-slate-300"
                            : "text-amber-600"
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {item.name}
                      </span>
                    </div>
                    <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                      {item.timeStr}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      )}

      {/* 2. 게임 플레이 화면 */}
      {screen === "game" && (
        <main className="flex-1 flex flex-col items-center justify-center w-full max-w-2xl my-2">
          {/* 게임 상단 HUD: 사용자 이름, 생명, 빨강 블록 제거 수, 경과 시간 (밝고 선명한 화이트 카드) */}
          <div className="w-full flex items-center justify-between bg-white border border-slate-200 px-4 py-2.5 rounded-2xl mb-3 shadow-md shadow-slate-200/50 text-xs sm:text-sm">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 font-medium">플레이어:</span>
              <span className="font-extrabold text-blue-600">{playerName}</span>
            </div>

            {/* 생명 표시 */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-medium">생명:</span>
              <span className="font-bold text-base">
                {"❤️".repeat(lives)}
                {"🖤".repeat(Math.max(0, 3 - lives))}
              </span>
            </div>

            {/* 빨강 블록 제거 카운트 */}
            <div className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-red-400 border border-red-500 inline-block mr-1"></span>
              <span className="text-slate-500 font-medium">타겟:</span>
              <span className="font-extrabold text-red-500">
                {redClearedCount} / 3
              </span>
            </div>

            {/* 경과 시간 */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-medium">시간:</span>
              <span className="font-mono font-black text-blue-700 text-sm sm:text-base">
                {formatTime(elapsedSeconds)}
              </span>
            </div>
          </div>

          {/* 메인 캔버스 영역 (화이트/소프트 프레임) */}
          <div
            className="relative w-full aspect-[640/520] max-w-[640px] rounded-2xl overflow-hidden border-2 border-slate-300 shadow-xl bg-slate-100 touch-none select-none"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <canvas
              ref={canvasRef}
              width={640}
              height={520}
              className="w-full h-full block"
            />

            {/* 카운트다운 오버레이 (3, 2, 1) */}
            {countdown !== null && countdown > 0 && (
              <div className="absolute inset-0 bg-white/70 backdrop-blur-xs flex flex-col items-center justify-center animate-fade-in pointer-events-none">
                <span className="text-8xl font-black text-blue-600 drop-shadow-[0_0_20px_rgba(37,99,235,0.4)] scale-110 transition-transform">
                  {countdown}
                </span>
                <span className="text-sm font-extrabold text-slate-700 mt-3 tracking-widest">
                  GET READY!
                </span>
              </div>
            )}

            {/* 일시정지 오버레이 */}
            {gameState === "paused" && (
              <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center space-y-4">
                <div className="text-3xl font-black text-blue-600">
                  PAUSED
                </div>
                <p className="text-xs font-semibold text-slate-600">
                  게임이 일시 정지되었습니다.
                </p>
                <button
                  onClick={togglePause}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 font-bold text-white rounded-xl text-sm transition shadow-md shadow-blue-500/30 cursor-pointer"
                >
                  계속하기 ▶
                </button>
              </div>
            )}

            {/* 미션 성공 (클리어) 모달 */}
            {gameState === "cleared" && (
              <div className="absolute inset-0 bg-white/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-fade-in">
                <div className="text-5xl mb-2">🎉</div>
                <h2 className="text-2xl font-black text-slate-900 mb-1">
                  MISSION COMPLETE!
                </h2>
                <p className="text-sm font-medium text-slate-600 mb-4">
                  연한 빨강 블록 3개를 모두 격파했습니다!
                </p>

                <div className="bg-slate-50 border border-slate-200 px-7 py-3 rounded-2xl mb-3 shadow-inner text-center w-full max-w-sm">
                  <div className="text-[11px] text-slate-400 font-medium mb-1">
                    게임 시작: {gameStartTime || "방금 전"} | 플레이어: {playerName}
                  </div>
                  <span className="text-xs text-slate-500 block mb-0.5 font-semibold">
                    내 완료 소요 시간
                  </span>
                  <span className="font-mono text-3xl font-black text-blue-600">
                    {finalTimeStr}
                  </span>
                </div>

                {/* 🏆 Top 3 빠른 기록 (이름과 시간 표시) */}
                {leaderboard.length > 0 && (
                  <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-3 mb-3 text-left shadow-sm">
                    <h3 className="text-xs font-bold text-amber-600 mb-2 flex items-center justify-between">
                      <span className="flex items-center gap-1">🏆 명예의 전당 Top 3</span>
                      <span className="text-[10px] text-slate-400 font-normal">빠른 기록 순</span>
                    </h3>
                    <div className="space-y-1.5 text-xs">
                      {leaderboard.slice(0, 3).map((item, idx) => (
                        <div
                          key={item.id}
                          className={`flex justify-between items-center px-3 py-1.5 rounded-xl border ${
                            item.name === playerName && item.timeStr === finalTimeStr
                              ? "bg-blue-50 border-blue-200 font-bold"
                              : "bg-slate-50 border-slate-100"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`font-black w-4 text-center ${
                                idx === 0
                                  ? "text-yellow-500"
                                  : idx === 1
                                  ? "text-slate-400"
                                  : "text-amber-600"
                              }`}
                            >
                              {idx + 1}
                            </span>
                            <span className="text-slate-800">
                              {item.name}
                              {item.name === playerName && item.timeStr === finalTimeStr && (
                                <span className="ml-1 text-[10px] text-blue-600 font-semibold">(내 기록)</span>
                              )}
                            </span>
                          </div>
                          <span className="font-mono font-bold text-blue-600">
                            {item.timeStr}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 구글 스프레드시트 자동 동기화 상태 뱃지 */}
                <div className="w-full max-w-sm mb-4">
                  <div
                    className={`w-full py-1.5 px-3 rounded-xl font-bold text-[11px] flex items-center justify-center gap-1.5 transition ${
                      isSavedToSheet
                        ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                        : isSaving
                        ? "bg-blue-50 text-blue-600 border border-blue-200"
                        : "bg-slate-50 text-slate-500 border border-slate-200"
                    }`}
                  >
                    {isSaving ? (
                      <span>⏳ 구글 시트에 자동 저장 및 Top 3 동기화 중...</span>
                    ) : isSavedToSheet ? (
                      <span>✅ 구글 시트 저장 및 Top 3 갱신 완료!</span>
                    ) : (
                      <span>📊 구글 시트 연동 중...</span>
                    )}
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleStartGame}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 font-extrabold text-white rounded-xl text-xs sm:text-sm transition shadow-md shadow-emerald-500/30 cursor-pointer"
                  >
                    한 판 더 하기
                  </button>
                  <button
                    onClick={handleRestart}
                    className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 font-extrabold text-slate-700 rounded-xl text-xs sm:text-sm transition cursor-pointer"
                  >
                    이름 입력 화면으로
                  </button>
                </div>
              </div>
            )}

            {/* 미션 실패 모달 (생명 0) */}
            {gameState === "failed" && (
              <div className="absolute inset-0 bg-white/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-fade-in">
                <div className="text-5xl mb-2">💥</div>
                <h2 className="text-2xl font-black text-red-600 mb-1">
                  게임 미션 실패!
                </h2>
                <p className="text-xs sm:text-sm font-medium text-slate-600 mb-6 max-w-xs">
                  공을 3번 모두 놓쳤습니다. 다시 도전해 보세요!
                </p>

                <div className="flex gap-3">
                  <button
                    onClick={handleStartGame}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 font-extrabold text-white rounded-xl text-xs sm:text-sm transition shadow-md shadow-blue-500/30 cursor-pointer"
                  >
                    다시 도전
                  </button>
                  <button
                    onClick={handleRestart}
                    className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 font-extrabold text-slate-700 rounded-xl text-xs sm:text-sm transition cursor-pointer"
                  >
                    이름 입력 화면으로
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 메인 화면 하단 컨트롤 버튼 (일시정지/계속, 다시 시작, 게임 종료) */}
          <div className="w-full flex items-center justify-between gap-3 mt-4">
            <button
              onClick={togglePause}
              disabled={gameState === "cleared" || gameState === "failed"}
              className="flex-1 py-3 bg-white hover:bg-slate-50 disabled:opacity-40 font-bold rounded-xl text-xs sm:text-sm text-slate-700 transition border border-slate-300 shadow-sm cursor-pointer"
            >
              {gameState === "paused" ? "▶ 계속하기" : "⏸ 중간 멈춤"}
            </button>
            <button
              onClick={handleRestart}
              className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 font-bold rounded-xl text-xs sm:text-sm text-white transition shadow-md shadow-blue-500/20 cursor-pointer"
            >
              🔄 다시 시작
            </button>
            <button
              onClick={handleExitGame}
              className="flex-1 py-3 bg-rose-500 hover:bg-rose-600 font-bold rounded-xl text-xs sm:text-sm text-white transition shadow-sm cursor-pointer"
            >
              🚪 게임 종료
            </button>
          </div>
        </main>
      )}

      {/* 푸터 */}
      <footer className="w-full max-w-2xl text-center py-2.5 text-[11px] text-slate-400 border-t border-slate-200 dark:border-slate-800">
        인천대학교 INU 벽돌깨기 게임 | BGM: Hyper_Speed_Run.mp3 | 마스코트: 횃불이
      </footer>
    </div>
  );
}
