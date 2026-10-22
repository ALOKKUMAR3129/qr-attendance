'use client';

import { useEffect, useState, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { Camera, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';

export default function QRScanner({ rollNo = '220101', studentName = 'Alok Kumar', branchSection = 'CS-2B1' }) {
  const [scanResult, setScanResult] = useState(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const scannerRef = useRef(null);

  useEffect(() => {
    const scanner = new Html5QrcodeScanner('qr-reader', {
      fps: 10,
      qrbox: { width: 250, height: 250 },
      aspectRatio: 1.0,
      showTorchButtonIfSupported: true,
    });

    scannerRef.current = scanner;

    scanner.render(
      (decodedText) => {
        handleScanSuccess(decodedText);
      },
      (error) => {
        // Scanning frame mismatch ignore
      }
    );

    return () => {
      scanner.clear().catch((err) => console.error(err));
    };
  }, []);

  const handleScanSuccess = async (decodedText) => {
    try {
      const parsedData = JSON.parse(decodedText);
      if (!parsedData.sessionId) {
        setStatusMsg('Invalid QR code scanned.');
        return;
      }

      if (scannerRef.current) {
        scannerRef.current.pause(true);
      }

      setScanResult(parsedData);
      submitAttendance(parsedData.sessionId);
    } catch {
      setStatusMsg('Unrecognized QR Code format.');
    }
  };

  const submitAttendance = (sessionId) => {
    setSubmitting(true);
    setStatusMsg('Checking GPS location...');

    if (!navigator.geolocation) {
      setStatusMsg('Location permission required for 500m verification.');
      setSubmitting(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;

        try {
          const res = await fetch('/api/attendance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId,
              rollNo,
              studentName,
              branchSection,
              latitude,
              longitude,
            }),
          });

          const data = await res.json();
          if (res.ok && data.success) {
            setIsSuccess(true);
            setStatusMsg(`Present! Distance from teacher: ${data.distance}m`);
          } else {
            setIsSuccess(false);
            setStatusMsg(data.message || 'Verification failed.');
          }
        } catch (err) {
          setIsSuccess(false);
          setStatusMsg(err.message || 'Server error occurred.');
        } finally {
          setSubmitting(false);
        }
      },
      () => {
        setIsSuccess(false);
        setStatusMsg('GPS permission denied. Please allow location access.');
        setSubmitting(false);
      },
      { enableHighAccuracy: true }
    );
  };

  const restartScanner = () => {
    setScanResult(null);
    setStatusMsg('');
    setIsSuccess(false);
    if (scannerRef.current) {
      scannerRef.current.resume();
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 max-w-md w-full mx-auto">
      <div className="flex items-center space-x-2 mb-4">
        <Camera className="w-5 h-5 text-indigo-600" />
        <h2 className="text-lg font-bold text-slate-800">Scan Attendance QR</h2>
      </div>

      <div className="mb-4 text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1">
        <p><span className="font-semibold text-slate-700">Student:</span> {studentName} ({rollNo})</p>
        <p><span className="font-semibold text-slate-700">Class:</span> {branchSection}</p>
      </div>

      {!scanResult && (
        <div id="qr-reader" className="w-full rounded-2xl overflow-hidden border border-slate-200" />
      )}

      {submitting && (
        <div className="mt-4 p-3 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center justify-center space-x-2 text-indigo-700 text-sm">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span>Verifying 500m geofence...</span>
        </div>
      )}

      {statusMsg && !submitting && (
        <div
          className={`mt-4 p-4 rounded-xl border text-sm flex items-start space-x-3 ${
            isSuccess
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {isSuccess ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <p className="font-medium">{statusMsg}</p>
            <button
              onClick={restartScanner}
              className="mt-3 text-xs underline font-semibold focus:outline-none"
            >
              Scan Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}