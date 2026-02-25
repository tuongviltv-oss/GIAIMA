/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Settings, 
  Play, 
  Plus, 
  Trash2, 
  Image as ImageIcon, 
  Volume2, 
  VolumeX, 
  ChevronLeft, 
  CheckCircle2, 
  XCircle,
  Trophy,
  RotateCcw,
  Clock,
  Layers,
  Users,
  Zap,
  Eye,
  EyeOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---
interface Question {
  id: string;
  text: string;
  options: string[];
  correctIndex: number;
}

type GameMode = 'classroom' | 'versus' | 'speed';
type Difficulty = 2 | 3 | 4 | 5;
type GameStatus = 'setup' | 'playing' | 'won';

const DEFAULT_QUESTIONS: Question[] = [
  { id: '1', text: '5 x 7 bằng bao nhiêu?', options: ['30', '35', '40', '45'], correctIndex: 1 },
  { id: '2', text: '48 chia 6 bằng bao nhiêu?', options: ['6', '7', '8', '9'], correctIndex: 2 },
  { id: '3', text: '125 + 75 bằng bao nhiêu?', options: ['190', '200', '210', '220'], correctIndex: 1 },
  { id: '4', text: '300 - 150 bằng bao nhiêu?', options: ['100', '150', '200', '250'], correctIndex: 1 },
  { id: '5', text: 'Hình vuông có cạnh 5cm. Chu vi là bao nhiêu?', options: ['15cm', '20cm', '25cm', '30cm'], correctIndex: 1 },
  { id: '6', text: '9 x 4 bằng bao nhiêu?', options: ['32', '34', '36', '38'], correctIndex: 2 },
  { id: '7', text: '81 chia 9 bằng bao nhiêu?', options: ['7', '8', '9', '10'], correctIndex: 2 },
  { id: '8', text: '1kg bằng bao nhiêu gam?', options: ['10g', '100g', '1000g', '10000g'], correctIndex: 2 },
  { id: '9', text: 'Số lớn nhất có 3 chữ số là số nào?', options: ['100', '900', '990', '999'], correctIndex: 3 },
  { id: '10', text: '15 x 2 bằng bao nhiêu?', options: ['25', '30', '35', '40'], correctIndex: 1 },
];

// --- Audio Helper ---
const playSound = (type: 'correct' | 'wrong' | 'win' | 'click') => {
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.connect(gain);
  gain.connect(ctx.destination);

  const now = ctx.currentTime;

  if (type === 'correct') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, now); // C5
    osc.frequency.exponentialRampToValueAtTime(1046.50, now + 0.2); // C6
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    osc.start(now);
    osc.stop(now + 0.3);
  } else if (type === 'wrong') {
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now); // A3
    osc.frequency.linearRampToValueAtTime(110, now + 0.2); // A2
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.3);
    osc.start(now);
    osc.stop(now + 0.3);
  } else if (type === 'win') {
    const frequencies = [523.25, 659.25, 783.99, 1046.50];
    frequencies.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.frequency.setValueAtTime(f, now + i * 0.1);
      g.gain.setValueAtTime(0.1, now + i * 0.1);
      g.gain.exponentialRampToValueAtTime(0.01, now + i * 0.1 + 0.5);
      o.start(now + i * 0.1);
      o.stop(now + i * 0.1 + 0.5);
    });
  } else if (type === 'click') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    osc.start(now);
    osc.stop(now + 0.1);
  }
};

export default function App() {
  // --- Game State ---
  const [status, setStatus] = useState<GameStatus>('setup');
  const [mode, setMode] = useState<GameMode>('classroom');
  const [difficulty, setDifficulty] = useState<Difficulty>(3);
  const [timeLimit, setTimeLimit] = useState(15);
  const [image, setImage] = useState<string>('https://picsum.photos/seed/edu/800/600');
  const [questions, setQuestions] = useState<Question[]>(DEFAULT_QUESTIONS);
  const [showQuestionEditor, setShowQuestionEditor] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // --- Playing State ---
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [openedCells, setOpenedCells] = useState<number[]>([]);
  const [timeLeft, setTimeLeft] = useState(timeLimit);
  const [score, setScore] = useState(0);
  const [teamScores, setTeamScores] = useState({ red: 0, blue: 0 });
  const [currentTeam, setCurrentTeam] = useState<'red' | 'blue'>('red');
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [isShaking, setIsShaking] = useState(false);
  const [selectedCell, setSelectedCell] = useState<number | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // --- Question Editor State ---
  const [newQText, setNewQText] = useState('');
  const [newQOptions, setNewQOptions] = useState(['', '', '', '']);
  const [newQCorrect, setNewQCorrect] = useState(0);

  // --- Effects ---
  useEffect(() => {
    if (status === 'playing' && !feedback) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            handleAnswer(-1); // Time out
            return timeLimit;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [status, feedback, timeLimit]);

  useEffect(() => {
    if (status === 'won') {
      startFireworks();
      if (!isMuted) playSound('win');
    }
  }, [status, isMuted]);

  const [isMusicOn, setIsMusicOn] = useState(false);
  const musicRef = useRef<AudioContext | null>(null);
  const musicOscRef = useRef<OscillatorNode | null>(null);

  const toggleMusic = () => {
    if (isMusicOn) {
      if (musicOscRef.current) {
        musicOscRef.current.stop();
        musicOscRef.current = null;
      }
      setIsMusicOn(false);
    } else {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(261.63, ctx.currentTime); // C4
      
      // Simple melody loop
      const notes = [261.63, 293.66, 329.63, 349.23, 392.00, 349.23, 329.63, 293.66];
      let nextNoteTime = ctx.currentTime;
      
      const playNextNote = () => {
        if (!musicOscRef.current) return;
        const noteIndex = Math.floor(ctx.currentTime * 2) % notes.length;
        osc.frequency.setTargetAtTime(notes[noteIndex], ctx.currentTime, 0.1);
        setTimeout(playNextNote, 500);
      };

      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.02, ctx.currentTime);
      
      osc.start();
      musicOscRef.current = osc;
      musicRef.current = ctx;
      setIsMusicOn(true);
      playNextNote();
    }
  };

  useEffect(() => {
    return () => {
      if (musicOscRef.current) musicOscRef.current.stop();
    };
  }, []);

  // --- Handlers ---
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setImage(url);
    }
  };

  const addQuestion = () => {
    if (!newQText || newQOptions.some(opt => !opt)) return;
    const newQ: Question = {
      id: Date.now().toString(),
      text: newQText,
      options: [...newQOptions],
      correctIndex: newQCorrect
    };
    setQuestions([...questions, newQ]);
    setNewQText('');
    setNewQOptions(['', '', '', '']);
    setNewQCorrect(0);
  };

  const deleteQuestion = (id: string) => {
    setQuestions(questions.filter(q => q.id !== id));
  };

  const startGame = () => {
    if (questions.length === 0) {
      alert('Vui lòng thêm ít nhất một câu hỏi!');
      return;
    }
    setOpenedCells([]);
    setSelectedCell(null);
    setCurrentQuestionIndex(0);
    setScore(0);
    setTeamScores({ red: 0, blue: 0 });
    setCurrentTeam('red');
    setTimeLeft(timeLimit);
    setStatus('playing');
    setFeedback(null);
    if (!isMuted) playSound('click');
  };

  const handleCellClick = (index: number) => {
    if (openedCells.includes(index) || selectedCell !== null || feedback !== null) return;
    
    setSelectedCell(index);
    setTimeLeft(timeLimit);
    if (!isMuted) playSound('click');
  };

  const handleAnswer = (index: number) => {
    if (feedback || selectedCell === null) return;

    const currentQ = questions[currentQuestionIndex % questions.length];
    const isCorrect = index === currentQ.correctIndex;

    if (isCorrect) {
      setFeedback('correct');
      if (!isMuted) playSound('correct');
      
      if (mode === 'versus') {
        setTeamScores(prev => ({ ...prev, [currentTeam]: prev[currentTeam] + 1 }));
      } else {
        setScore(s => s + 1);
      }
      
      const newOpened = [...openedCells, selectedCell];
      setOpenedCells(newOpened);
      
      // Check win condition
      const totalCells = difficulty * difficulty;
      if (newOpened.length === totalCells) {
        setTimeout(() => setStatus('won'), 1000);
      }
    } else {
      setFeedback('wrong');
      setIsShaking(true);
      if (!isMuted) playSound('wrong');
      setTimeout(() => setIsShaking(false), 500);
    }

    setTimeout(() => {
      setFeedback(null);
      setSelectedCell(null);
      setCurrentQuestionIndex(prev => (prev + 1) % questions.length);
      setTimeLeft(timeLimit);
      if (mode === 'versus') {
        setCurrentTeam(prev => prev === 'red' ? 'blue' : 'red');
      }
    }, 1500);
  };

  const startFireworks = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles: any[] = [];
    const colors = ['#FF5733', '#33FF57', '#3357FF', '#F3FF33', '#FF33F3'];

    function createFirework(x: number, y: number) {
      for (let i = 0; i < 50; i++) {
        particles.push({
          x,
          y,
          vx: (Math.random() - 0.5) * 10,
          vy: (Math.random() - 0.5) * 10,
          size: Math.random() * 3 + 1,
          color: colors[Math.floor(Math.random() * colors.length)],
          alpha: 1
        });
      }
    }

    let frame = 0;
    function animate() {
      if (status !== 'won') return;
      ctx!.fillStyle = 'rgba(0, 0, 0, 0.1)';
      ctx!.fillRect(0, 0, canvas!.width, canvas!.height);

      if (frame % 30 === 0) {
        createFirework(Math.random() * canvas!.width, Math.random() * canvas!.height * 0.5);
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.1; // gravity
        p.alpha -= 0.01;

        if (p.alpha <= 0) {
          particles.splice(i, 1);
          continue;
        }

        ctx!.globalAlpha = p.alpha;
        ctx!.fillStyle = p.color;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx!.fill();
      }

      frame++;
      requestAnimationFrame(animate);
    }

    animate();
  };

  // --- Render Helpers ---
  const renderSetup = () => (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <motion.div 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="text-center space-y-4"
      >
        <h1 className="text-5xl font-black text-sky-600 tracking-tight drop-shadow-sm">
          GIẢI MÃ BỨC TRANH
        </h1>
        <p className="text-xl text-slate-500 font-medium italic">Mở ô chữ - Khám phá bí mật</p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Settings Card */}
        <div className="bg-white rounded-3xl p-8 shadow-xl border-b-8 border-slate-200 space-y-6">
          <div className="flex items-center gap-3 text-2xl font-bold text-slate-700">
            <Settings className="w-8 h-8 text-sky-500" />
            Cài đặt trò chơi
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">Chế độ chơi</label>
              <div className="grid grid-cols-3 gap-2">
                {(['classroom', 'versus', 'speed'] as GameMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`py-3 rounded-xl font-bold transition-all ${
                      mode === m 
                        ? 'bg-sky-500 text-white shadow-lg scale-105' 
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {m === 'classroom' ? <Users className="mx-auto" /> : m === 'versus' ? <Zap className="mx-auto" /> : <Clock className="mx-auto" />}
                    <span className="text-xs mt-1 block">
                      {m === 'classroom' ? 'Lớp học' : m === 'versus' ? 'Đối kháng' : 'Tăng tốc'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">Độ khó (Lưới)</label>
              <div className="grid grid-cols-4 gap-2">
                {[2, 3, 4, 5].map((d) => (
                  <button
                    key={d}
                    onClick={() => setDifficulty(d as Difficulty)}
                    className={`py-3 rounded-xl font-bold transition-all ${
                      difficulty === d 
                        ? 'bg-emerald-500 text-white shadow-lg scale-105' 
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {d}x{d}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">Thời gian: {timeLimit} giây</label>
              <input 
                type="range" 
                min="5" 
                max="30" 
                value={timeLimit} 
                onChange={(e) => setTimeLimit(parseInt(e.target.value))}
                className="w-full h-3 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-sky-500"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">Ảnh bí mật</label>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-xl overflow-hidden border-4 border-slate-100 bg-slate-50 flex-shrink-0">
                  <img src={image} alt="Preview" className="w-full h-full object-cover" />
                </div>
                <label className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-slate-100 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer hover:bg-slate-200 transition-colors text-slate-600 font-bold">
                  <ImageIcon className="w-5 h-5" />
                  Chọn ảnh mới
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Action Card */}
        <div className="flex flex-col gap-4">
          <button 
            onClick={startGame}
            className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded-3xl p-8 shadow-xl border-b-8 border-emerald-700 transition-all active:border-b-0 active:translate-y-2 flex flex-col items-center justify-center gap-4 group"
          >
            <Play className="w-20 h-20 fill-current group-hover:scale-110 transition-transform" />
            <span className="text-3xl font-black uppercase tracking-widest">Bắt đầu chơi</span>
          </button>

          <button 
            onClick={() => setShowQuestionEditor(!showQuestionEditor)}
            className="bg-white hover:bg-slate-50 text-slate-700 rounded-3xl p-6 shadow-lg border-b-4 border-slate-200 transition-all flex items-center justify-center gap-3 font-bold text-xl"
          >
            {showQuestionEditor ? <EyeOff /> : <Settings />}
            {showQuestionEditor ? 'Ẩn tùy chỉnh câu hỏi' : 'Tùy chỉnh câu hỏi'}
          </button>
        </div>
      </div>

      {/* Question Editor */}
      <AnimatePresence>
        {showQuestionEditor && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-white rounded-3xl p-8 shadow-xl border-b-8 border-slate-200 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-slate-700 flex items-center gap-2">
                  <Layers className="text-amber-500" />
                  Quản lý câu hỏi ({questions.length})
                </h2>
                <button 
                  onClick={() => { if(confirm('Xóa tất cả câu hỏi?')) setQuestions([]); }}
                  className="text-rose-500 hover:text-rose-600 font-bold flex items-center gap-1"
                >
                  <Trash2 className="w-4 h-4" /> Xóa tất cả
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Add New */}
                <div className="space-y-4 bg-slate-50 p-6 rounded-2xl border-2 border-slate-100">
                  <h3 className="font-bold text-slate-600 uppercase text-sm tracking-widest">Thêm câu hỏi mới</h3>
                  <textarea 
                    placeholder="Nhập nội dung câu hỏi..."
                    value={newQText}
                    onChange={(e) => setNewQText(e.target.value)}
                    className="w-full p-4 rounded-xl border-2 border-slate-200 focus:border-sky-500 outline-none min-h-[100px] font-medium"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    {newQOptions.map((opt, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input 
                          type="radio" 
                          name="correct" 
                          checked={newQCorrect === i} 
                          onChange={() => setNewQCorrect(i)}
                          className="w-5 h-5 accent-emerald-500"
                        />
                        <input 
                          placeholder={`Đáp án ${String.fromCharCode(65 + i)}`}
                          value={opt}
                          onChange={(e) => {
                            const next = [...newQOptions];
                            next[i] = e.target.value;
                            setNewQOptions(next);
                          }}
                          className="flex-1 p-2 rounded-lg border-2 border-slate-200 focus:border-sky-500 outline-none text-sm"
                        />
                      </div>
                    ))}
                  </div>
                  <button 
                    onClick={addQuestion}
                    className="w-full py-3 bg-sky-500 hover:bg-sky-600 text-white rounded-xl font-bold shadow-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <Plus className="w-5 h-5" /> Thêm vào danh sách
                  </button>
                </div>

                {/* List */}
                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {questions.map((q, idx) => (
                    <div key={q.id} className="bg-white p-4 rounded-xl border-2 border-slate-100 shadow-sm flex items-start justify-between gap-4 group">
                      <div>
                        <p className="font-bold text-slate-700 text-sm">{idx + 1}. {q.text}</p>
                        <p className="text-xs text-emerald-600 font-bold mt-1">✓ {q.options[q.correctIndex]}</p>
                      </div>
                      <button 
                        onClick={() => deleteQuestion(q.id)}
                        className="text-slate-300 hover:text-rose-500 transition-colors"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                  {questions.length === 0 && (
                    <div className="text-center py-10 text-slate-400 font-medium">
                      Chưa có câu hỏi nào.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer Controls */}
      <div className="fixed bottom-6 right-6 flex gap-3">
        <button 
          onClick={toggleMusic}
          className={`w-14 h-14 rounded-full shadow-xl border-b-4 flex items-center justify-center transition-all ${
            isMusicOn ? 'bg-amber-400 text-white border-amber-600' : 'bg-white text-slate-600 border-slate-200'
          }`}
          title="Nhạc nền"
        >
          <Volume2 className={isMusicOn ? 'animate-bounce' : ''} />
        </button>
        <button 
          onClick={() => setIsMuted(!isMuted)}
          className="w-14 h-14 bg-white rounded-full shadow-xl border-b-4 border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 transition-all"
          title="Âm thanh hiệu ứng"
        >
          {isMuted ? <VolumeX /> : <Volume2 />}
        </button>
      </div>
    </div>
  );

  const renderPlaying = () => {
    const currentQ = questions[currentQuestionIndex % questions.length];
    const progress = (timeLeft / timeLimit) * 100;

    return (
      <div className="min-h-screen flex flex-col p-4 md:p-8 gap-8 max-w-7xl mx-auto">
        {/* Header Info */}
        <div className="flex items-center justify-between bg-white p-4 rounded-2xl shadow-md border-b-4 border-slate-100">
          <button 
            onClick={() => setStatus('setup')}
            className="flex items-center gap-2 text-slate-500 font-bold hover:text-sky-500 transition-colors"
          >
            <ChevronLeft /> Thoát
          </button>
          
          <div className="flex items-center gap-8">
            {mode === 'versus' ? (
              <div className="flex items-center bg-slate-100 rounded-full px-6 py-2 border-2 border-slate-200">
                <div className={`flex items-center gap-2 px-4 transition-all ${currentTeam === 'red' ? 'scale-110' : 'opacity-50'}`}>
                  <div className="w-4 h-4 rounded-full bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]" />
                  <span className="font-black text-rose-600">ĐỎ: {teamScores.red}</span>
                </div>
                <div className="w-px h-6 bg-slate-300 mx-2" />
                <div className={`flex items-center gap-2 px-4 transition-all ${currentTeam === 'blue' ? 'scale-110' : 'opacity-50'}`}>
                  <div className="w-4 h-4 rounded-full bg-sky-500 shadow-[0_0_10px_rgba(14,165,233,0.5)]" />
                  <span className="font-black text-sky-600">XANH: {teamScores.blue}</span>
                </div>
              </div>
            ) : (
              <>
                <div className="text-center">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Điểm số</p>
                  <p className="text-2xl font-black text-emerald-500">{score}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Đã mở</p>
                  <p className="text-2xl font-black text-sky-500">{openedCells.length}/{difficulty * difficulty}</p>
                </div>
              </>
            )}
            <button 
              onClick={() => {
                const guess = prompt("Bạn đoán bức tranh này là gì?");
                if (guess) {
                  if (confirm("Bạn có chắc chắn muốn đoán không? Nếu đúng bạn sẽ thắng ngay lập tức!")) {
                    setStatus('won');
                  }
                }
              }}
              className="px-4 py-2 bg-amber-400 hover:bg-amber-500 text-white rounded-xl font-bold shadow-md transition-all flex items-center gap-2"
            >
              <Eye className="w-4 h-4" /> Đoán ảnh
            </button>
          </div>

          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
             <Clock className={`w-6 h-6 ${timeLeft < 5 && selectedCell !== null ? 'text-rose-500 animate-pulse' : 'text-slate-400'}`} />
          </div>
        </div>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          {/* Left: The Grid */}
          <div className="relative aspect-square max-w-[500px] mx-auto w-full bg-slate-200 rounded-3xl overflow-hidden shadow-2xl border-8 border-white">
            <img src={image} alt="Secret" className="w-full h-full object-cover" />
            
            <div 
              className="absolute inset-0 grid gap-1 p-1"
              style={{ 
                gridTemplateColumns: `repeat(${difficulty}, 1fr)`,
                gridTemplateRows: `repeat(${difficulty}, 1fr)`
              }}
            >
              {Array.from({ length: difficulty * difficulty }).map((_, i) => (
                <motion.div
                  key={i}
                  initial={false}
                  animate={{ 
                    opacity: openedCells.includes(i) ? 0 : 1,
                    scale: openedCells.includes(i) ? 0.8 : 1,
                    rotateY: openedCells.includes(i) ? 90 : 0,
                    backgroundColor: selectedCell === i ? '#FBBF24' : '#0EA5E9'
                  }}
                  whileHover={!openedCells.includes(i) && selectedCell === null ? { scale: 1.05, backgroundColor: '#38BDF8' } : {}}
                  onClick={() => handleCellClick(i)}
                  transition={{ duration: 0.5, ease: 'backOut' }}
                  className={`border border-sky-400 flex items-center justify-center text-white font-black text-2xl shadow-inner select-none transition-colors ${
                    !openedCells.includes(i) && selectedCell === null ? 'cursor-pointer' : 'cursor-default'
                  }`}
                >
                  {i + 1}
                </motion.div>
              ))}
            </div>
          </div>

          {/* Right: Question Area */}
          <div className="space-y-6">
            <AnimatePresence mode="wait">
              {selectedCell !== null ? (
                <motion.div 
                  key="question"
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -20, opacity: 0 }}
                  className="bg-white rounded-3xl p-8 shadow-xl border-b-8 border-slate-200 relative overflow-hidden"
                >
                  {/* Progress Bar */}
                  <div className="absolute top-0 left-0 h-2 bg-slate-100 w-full">
                    <motion.div 
                      className={`h-full ${timeLeft < 5 ? 'bg-rose-500' : 'bg-sky-500'}`}
                      initial={{ width: '100%' }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 1, ease: 'linear' }}
                    />
                  </div>

                  <motion.div
                    key={currentQuestionIndex}
                    initial={{ x: 50, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    className={`space-y-8 pt-4 ${isShaking ? 'animate-shake' : ''}`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="px-3 py-1 bg-amber-100 text-amber-600 rounded-full text-xs font-black uppercase tracking-widest">
                            Đang mở ô số {selectedCell + 1}
                          </span>
                          {mode === 'versus' && (
                            <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest ${
                              currentTeam === 'red' ? 'bg-rose-100 text-rose-600' : 'bg-sky-100 text-sky-600'
                            }`}>
                              Lượt Đội {currentTeam === 'red' ? 'Đỏ' : 'Xanh'}
                            </span>
                          )}
                        </div>
                        <span className="px-3 py-1 bg-sky-100 text-sky-600 rounded-full text-xs font-black uppercase tracking-widest">
                          Câu hỏi {currentQuestionIndex + 1}
                        </span>
                      </div>
                      <h2 className="text-3xl font-bold text-slate-800 leading-tight">
                        {currentQ.text}
                      </h2>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {currentQ.options.map((opt, i) => (
                        <button
                          key={i}
                          disabled={!!feedback}
                          onClick={() => handleAnswer(i)}
                          className={`
                            p-6 rounded-2xl text-xl font-bold transition-all border-b-4 active:border-b-0 active:translate-y-1
                            ${feedback === null 
                              ? 'bg-slate-50 hover:bg-sky-50 text-slate-700 border-slate-200 hover:border-sky-200' 
                              : feedback === 'correct' && i === currentQ.correctIndex
                                ? 'bg-emerald-500 text-white border-emerald-700 scale-105 z-10'
                                : feedback === 'wrong' && i === currentQ.correctIndex
                                  ? 'bg-emerald-500 text-white border-emerald-700'
                                  : 'bg-slate-100 text-slate-400 border-slate-200 opacity-50'
                            }
                          `}
                        >
                          <span className="inline-block w-8 h-8 rounded-lg bg-white/20 mr-3 text-center leading-8">
                            {String.fromCharCode(65 + i)}
                          </span>
                          {opt}
                        </button>
                      ))}
                    </div>
                  </motion.div>

                  {/* Feedback Overlay */}
                  <AnimatePresence>
                    {feedback && (
                      <motion.div 
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm z-20"
                      >
                        <div className="text-center space-y-2">
                          {feedback === 'correct' ? (
                            <>
                              <CheckCircle2 className="w-24 h-24 text-emerald-500 mx-auto" />
                              <p className="text-3xl font-black text-emerald-600 uppercase tracking-widest">Chính xác!</p>
                            </>
                          ) : (
                            <>
                              <XCircle className="w-24 h-24 text-rose-500 mx-auto" />
                              <p className="text-3xl font-black text-rose-600 uppercase tracking-widest">Sai rồi!</p>
                            </>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ) : (
                <motion.div 
                  key="instruction"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="bg-white rounded-3xl p-12 shadow-xl border-b-8 border-slate-200 text-center space-y-6"
                >
                  <div className="w-24 h-24 bg-sky-100 text-sky-500 rounded-full flex items-center justify-center mx-auto">
                    <Play className="w-12 h-12 fill-current" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-2xl font-black text-slate-700">SẴN SÀNG CHƯA?</h3>
                    <p className="text-slate-500 font-medium">Hãy chọn một ô số trên lưới để bắt đầu giải mã!</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    );
  };

  const renderWon = () => (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />
      
      <motion.div 
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-[3rem] p-12 shadow-2xl border-b-[12px] border-emerald-100 max-w-lg w-full text-center space-y-8 relative z-10"
      >
        <div className="relative inline-block">
          <Trophy className="w-32 h-32 text-amber-400 mx-auto drop-shadow-lg" />
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
            className="absolute -inset-4 border-4 border-dashed border-amber-200 rounded-full"
          />
        </div>

        <div className="space-y-2">
          <h2 className="text-5xl font-black text-slate-800">
            {mode === 'versus' 
              ? (teamScores.red > teamScores.blue ? 'ĐỘI ĐỎ THẮNG!' : teamScores.blue > teamScores.red ? 'ĐỘI XANH THẮNG!' : 'HÒA NHAU!')
              : 'CHIẾN THẮNG!'
            }
          </h2>
          <p className="text-xl text-slate-500 font-medium">Bạn đã giải mã thành công bức tranh bí mật</p>
        </div>

        <div className="bg-slate-50 rounded-3xl p-6 grid grid-cols-2 gap-4">
          {mode === 'versus' ? (
            <>
              <div className="text-center">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Đội Đỏ</p>
                <p className="text-4xl font-black text-rose-500">{teamScores.red}</p>
              </div>
              <div className="text-center">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Đội Xanh</p>
                <p className="text-4xl font-black text-sky-500">{teamScores.blue}</p>
              </div>
            </>
          ) : (
            <>
              <div className="text-center">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Tổng điểm</p>
                <p className="text-4xl font-black text-emerald-500">{score}</p>
              </div>
              <div className="text-center">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Độ khó</p>
                <p className="text-4xl font-black text-sky-500">{difficulty}x{difficulty}</p>
              </div>
            </>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <button 
            onClick={() => setStatus('setup')}
            className="w-full py-5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl text-2xl font-black shadow-xl border-b-8 border-emerald-700 transition-all active:border-b-0 active:translate-y-2 flex items-center justify-center gap-3"
          >
            <RotateCcw className="w-8 h-8" /> CHƠI LẠI
          </button>
          
          <div className="flex items-center justify-center gap-2 text-slate-400 font-bold">
            <ImageIcon className="w-5 h-5" />
            <span>Ảnh: {image.startsWith('blob') ? 'Ảnh tải lên' : 'Ảnh mặc định'}</span>
          </div>
        </div>
      </motion.div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F0F7FF] font-sans text-slate-900 selection:bg-sky-200">
      {/* Background Decoration */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden opacity-20">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-sky-300 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-300 rounded-full blur-[120px]" />
      </div>

      <main className="relative z-10">
        {status === 'setup' && renderSetup()}
        {status === 'playing' && renderPlaying()}
        {status === 'won' && renderWon()}
      </main>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-10px); }
          75% { transform: translateX(10px); }
        }
        .animate-shake {
          animation: shake 0.2s ease-in-out 0s 2;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      `}</style>
    </div>
  );
}
