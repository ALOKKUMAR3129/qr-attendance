'use client';

import { useState } from 'react';
import QRCode from 'qrcode';
import { MapPin, RefreshCw, QrCode as QrIcon } from 'lucide-react';

export default function QRGenerator({ teacherId = 'T101' }) {
  const [subject, setSubject] = useState('Operating Systems');
  const [branchSection, setBranchSection] = useState('CS-2B1');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const generateAttendanceQR = () => {
    setError('');
    setLoading(true);

    if (!navigator.geolocation) {
      setError('Geolocation browser me supported nahi hai.');
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;

        try {
          const res = await fetch('/api/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              teacherId,
              subject,
              branchSection,
              latitude,
              longitude,
            }),
          });

          const data = await res.json();
          if (!data.success) {
            throw new Error(data.message || 'Session create fail ho gaya.');
          }

          setSessionId(data.sessionId);

          const qrPayload = JSON.stringify({
            sessionId: data.sessionId,
            subject,
            branchSection,
          });

          const url = await QRCode.toDataURL(qrPayload, {
            width: 300,
            margin: 2,
          });

          setQrDataUrl(url);
        } catch (err) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
      },
      () => {
        setError('Location permission allow karein taaki 500m geofence ban sake.');
        setLoading(false);
      },
      { enableHighAccuracy: true }
    );
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 max-w-md w-full mx-auto">
      <div className="flex items-center space-x-2 mb-5">
        <QrIcon className="w-6 h-6 text-indigo-600" />
        <h2 className="text-xl font-bold text-slate-800">Generate Attendance QR</h2>
      </div>

      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Subject</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full px-3 py-2 border rounded-xl text-slate-800 focus:ring-2 focus:ring-indigo-500 text-sm"
            placeholder="e.g. Operating Systems"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Section</label>
          <input
            type="text"
            value={branchSection}
            onChange={(e) => setBranchSection(e.target.value)}
            className="w-full px-3 py-2 border rounded-xl text-slate-800 focus:ring-2 focus:ring-indigo-500 text-sm"
            placeholder="e.g. CS-2B1"
          />
        </div>

        <button
          onClick={generateAttendanceQR}
          disabled={loading}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 rounded-xl transition flex items-center justify-center space-x-2 text-sm shadow-md disabled:bg-indigo-300"
        >
          {loading ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Fetching GPS & Generating...</span>
            </>
          ) : (
            <span>Generate Dynamic QR (500m)</span>
          )}
        </button>
      </div>

      {error && (
        <div className="p-3 mb-4 bg-red-50 border border-red-200 text-red-600 rounded-xl text-xs">
          {error}
        </div>
      )}

      {qrDataUrl && (
        <div className="flex flex-col items-center justify-center p-4 bg-slate-50 rounded-2xl border border-slate-200">
          <img src={qrDataUrl} alt="Attendance QR Code" className="rounded-xl shadow-sm border mb-3" />
          <div className="flex items-center text-xs text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-full font-medium border border-emerald-200 mb-2">
            <MapPin className="w-3.5 h-3.5 mr-1" />
            <span>Geofence Active: 500 Meters Radius</span>
          </div>
          <p className="text-[11px] text-slate-500">Session: {sessionId}</p>
        </div>
      )}
    </div>
  );
}