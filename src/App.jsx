import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Html5Qrcode } from "html5-qrcode";
import "./App.css";

const API_URL = import.meta.env.VITE_GUDANG_API_URL;
const API_TOKEN = import.meta.env.VITE_GUDANG_API_TOKEN;

function App() {
  const scannerRef = useRef(null);
  const scanLockedRef = useRef(false);
  const audioCtxRef = useRef(null);

  const [lookup, setLookup] = useState(null);
  const [mode, setMode] = useState("");
  const [qty, setQty] = useState("");
  const [harga, setHarga] = useState("");
  const [ref, setRef] = useState("");
  const [message, setMessage] = useState("Scan QR untuk mulai.");
  const [status, setStatus] = useState("");

  useEffect(() => {
    startScanner();

    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

async function api(payload) {
  const res = await fetch(API_URL, {
    method: "POST",
    redirect: "follow",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      token: API_TOKEN,
      ...payload
    })
  });

  const text = await res.text();

  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error("Response bukan JSON: " + text.slice(0, 120));
  }
}

  async function startScanner() {
    try {
      setMessage("Memeriksa kamera...");
      setStatus("");

      const cameras = await Html5Qrcode.getCameras();

      if (!cameras || cameras.length === 0) {
        throw new Error("Tidak ada kamera terdeteksi.");
      }

      const backCamera =
        cameras.find(c => String(c.label || "").toLowerCase().includes("back")) ||
        cameras[cameras.length - 1];

      const scanner = new Html5Qrcode("reader");
      scannerRef.current = scanner;

      await scanner.start(
        backCamera.id,
        {
          fps: 10,
          qrbox: { width: 250, height: 250 }
        },
        decodedText => handleScan(decodedText),
        () => {}
      );

      setMessage("Kamera aktif. Scan QR.");
      setStatus("success");
    } catch (err) {
      setMessage("Gagal membuka kamera: " + err.message);
      setStatus("error");
    }
  }


async function handleScan(qrText) {
  if (scanLockedRef.current) return;

  scanLockedRef.current = true;

  try {
    setMessage("QR terbaca:\n" + qrText);
    setStatus("");

    const result = await api({
      action: "LOOKUP_QR",
      qrText
    });

    if (!result.ok) {
      errorSound();
      setLookup(null);
      setMessage(result.message);
      setStatus("error");

      setTimeout(() => {
        scanLockedRef.current = false;
      }, 2000);

      return;
    }

    successSound();
    navigator.vibrate?.(120);

    setLookup(result);
    setMessage("QR valid.");
    setStatus("success");

    if (scannerRef.current) {
      scannerRef.current.pause(true);
    }

  } catch (err) {
    errorSound();
    setMessage(err.message);
    setStatus("error");

    setTimeout(() => {
      scanLockedRef.current = false;
    }, 2000);
  }
}
  

  function manualScan() {
    const text = document.getElementById("manualQr").value.trim();
    if (!text) return;

    handleScan(text);
  }

  async function confirmAction() {
    try {
      if (!lookup) throw new Error("Belum ada QR valid.");
      if (!mode) throw new Error("Pilih IN atau OUT.");

      let result;

      if (mode === "IN") {
        if (lookup.type !== "BAHAN") throw new Error("IN harus memakai QR BAHAN.");

        result = await api({
          action: "GUDANG_IN",
          kodeBahan: lookup.kodeBahan,
          qty: Number(qty),
          harga: Number(harga),
          ref,
          keterangan: "IN Gudang via mobile"
        });
      }

      if (mode === "OUT") {
        if (lookup.type !== "SPK") throw new Error("OUT harus memakai QR SPK.");

        result = await api({
          action: "GUDANG_OUT_SPK",
          noSpk: lookup.noSpk
        });
      }

      if (!result.ok) {
        errorSound();
        setMessage(result.message);
        setStatus("error");
        return;
      }

      successSound();
      navigator.vibrate?.(120);
      setMessage(result.message);
      setStatus("success");
      setQty("");
    } catch (err) {
      errorSound();
      setMessage(err.message);
      setStatus("error");
    }
  }

  function press(n) {
    setQty(prev => prev + n);
  }

  function clearQty() {
    setQty("");
  }

  function scanSuccessSound() {
  beep(1320, 55);
  setTimeout(() => beep(1760, 70), 65);
}

function successSound() {
  beep(1320, 60);
  setTimeout(() => beep(1760, 70), 70);
  setTimeout(() => beep(2200, 80), 150);
}

function errorSound() {
  beep(220, 180);
  setTimeout(() => beep(180, 220), 190);
}

function unlockAudio() {
  if (!audioCtxRef.current) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtxRef.current = new AudioContext();
  }

  if (audioCtxRef.current.state === "suspended") {
    audioCtxRef.current.resume();
  }
}

  
function beep(freq, duration) {
  unlockAudio();

  const ctx = audioCtxRef.current;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.value = freq;

  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration / 1000);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start();
  osc.stop(ctx.currentTime + duration / 1000);
}

  return (
    <div className="app">
      <h1>Scanner Gudang TLJ</h1>

      <div id="reader"></div>

    <details className="manual">
  <summary>Manual QR</summary>
  <input id="manualQr" placeholder="BAHAN|BB-0004" />
  <button onClick={manualScan}>SCAN</button>
</details>

      <div className={"status " + status}>{message}</div>

<button
  className="reset"
  onClick={() => {
    scanLockedRef.current = false;
    scannerRef.current?.resume();
    setMessage("Kamera aktif. Scan QR.");
    setStatus("success");
  }}
>
  SCAN LAGI
</button>
      
      {lookup && (
        <div className="card">
          <b>{lookup.type}</b>

          {lookup.type === "BAHAN" && (
            <>
              <p>Kode: {lookup.kodeBahan}</p>
              <p>Nama: {lookup.namaBahan}</p>
              <p>Stok: {lookup.qtyAkhir} {lookup.satuan}</p>
            </>
          )}

          {lookup.type === "SPK" && (
            <>
              <p>No SPK: {lookup.noSpk}</p>
              <ul>
                {lookup.bahan.map((b, i) => (
                  <li key={i}>
                    {b.kodeBahan} - {b.namaBahan} | {b.kebutuhan} {b.satuan}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

     <div className="mode">
  <button
    className={mode === "IN" ? "active" : ""}
    onClick={() => {
      unlockAudio();
      setMode("IN");
    }}
  >
    IN
  </button>

  <button
    className={mode === "OUT" ? "active" : ""}
    onClick={() => {
      unlockAudio();
      setMode("OUT");
    }}
  >
    OUT
  </button>
</div>

      {mode === "IN" && (
        <div className="card">
          <input placeholder="Harga Satuan" value={harga} onChange={e => setHarga(e.target.value)} />
          <input placeholder="No Referensi" value={ref} onChange={e => setRef(e.target.value)} />
        </div>
      )}

      <div className="qty">{qty || "0"}</div>

      <div className="pad">
        {[1,2,3,4,5,6,7,8,9,".",0].map(n => (
          <button key={n} onClick={() => press(String(n))}>{n}</button>
        ))}
        <button onClick={clearQty}>C</button>
      </div>

     <button
  className="confirm"
  onClick={() => {
    unlockAudio();
    confirmAction();
  }}
>
  CONFIRM
</button>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
