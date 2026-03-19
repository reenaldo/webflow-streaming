'use client';

import { useEffect, useState } from 'react';

interface LicenseInfo {
  key: string;
  firstName: string;
  lastName: string;
  expiresAt: string | null;
  validityPeriod: string;
  usedAt: string | null;
}

interface LicenseInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function LicenseInfoModal({ isOpen, onClose }: LicenseInfoModalProps) {
  const [licenseInfo, setLicenseInfo] = useState<LicenseInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;

    const loadLicenseInfo = async () => {
      setLoading(true);

      try {
        const licenseKey = localStorage.getItem('pro_license_key');
        if (!licenseKey) {
          setLoading(false);
          return;
        }

        // Fetch license details from backend
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/validate-license`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ licenseKey }),
        });

        const data = await response.json();

        if (data.valid) {
          setLicenseInfo({
            key: licenseKey,
            firstName: data.user.firstName,
            lastName: data.user.lastName,
            expiresAt: data.expiresAt,
            validityPeriod: data.validityPeriod || 'Lifetime',
            usedAt: data.usedAt || null,
          });
        }
      } catch (error) {
        console.error('Error loading license info:', error);
      } finally {
        setLoading(false);
      }
    };

    loadLicenseInfo();
  }, [isOpen]);

  if (!isOpen) return null;

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isExpired = licenseInfo?.expiresAt && new Date(licenseInfo.expiresAt) < new Date();

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-lg shadow-2xl max-w-md w-full border border-gray-800">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">PRO License Details</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6">
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
              <p className="text-gray-400 mt-4">Loading license details...</p>
            </div>
          ) : licenseInfo ? (
            <div className="space-y-4">
              {/* Status Badge */}
              <div className="flex items-center justify-center mb-6">
                {isExpired ? (
                  <span className="px-4 py-2 bg-red-900/50 text-red-300 rounded-lg text-sm font-medium border border-red-800">
                    License Expired
                  </span>
                ) : (
                  <span className="px-4 py-2 bg-purple-900/50 text-purple-300 rounded-lg text-sm font-medium border border-purple-800">
                    Active PRO License
                  </span>
                )}
              </div>

              {/* License Details */}
              <div className="space-y-3">
                <div className="bg-gray-800/50 rounded-lg p-4">
                  <label className="text-xs text-gray-400 block mb-1">License Holder</label>
                  <p className="text-white font-medium">{licenseInfo.firstName} {licenseInfo.lastName}</p>
                </div>

                <div className="bg-gray-800/50 rounded-lg p-4">
                  <label className="text-xs text-gray-400 block mb-1">License Key</label>
                  <p className="text-white font-mono text-sm">{licenseInfo.key}</p>
                </div>

                <div className="bg-gray-800/50 rounded-lg p-4">
                  <label className="text-xs text-gray-400 block mb-1">Validity Period</label>
                  <p className="text-white font-medium">{licenseInfo.validityPeriod}</p>
                </div>

                <div className="bg-gray-800/50 rounded-lg p-4">
                  <label className="text-xs text-gray-400 block mb-1">Expiration Date</label>
                  <p className={`font-medium ${isExpired ? 'text-red-400' : 'text-white'}`}>
                    {formatDate(licenseInfo.expiresAt)}
                  </p>
                </div>

                {licenseInfo.usedAt && (
                  <div className="bg-gray-800/50 rounded-lg p-4">
                    <label className="text-xs text-gray-400 block mb-1">First Activated</label>
                    <p className="text-white font-medium">{formatDate(licenseInfo.usedAt)}</p>
                  </div>
                )}
              </div>

              {isExpired && (
                <div className="mt-4 p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-400 text-sm">
                  Your license has expired. Please contact support to renew your access.
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-400">No license information found.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-800/50 border-t border-gray-800 rounded-b-lg">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
