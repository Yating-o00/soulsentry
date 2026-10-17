import React from "react";
import QRCode from "qrcode";

export default function QRCodeImage({ value, size = 200, className, alt = "QR" }) {
  const [dataUrl, setDataUrl] = React.useState(null);

  React.useEffect(() => {
    let active = true;
    const text = String(value || "");
    if (!text) {
      setDataUrl(null);
      return () => {};
    }

    QRCode.toDataURL(text, {
      width: Number(size) || 200,
      margin: 1,
      errorCorrectionLevel: "M"
    }).then((url) => {
      if (active) setDataUrl(url);
    }).catch((_error) => {
      void _error;
      if (active) setDataUrl(null);
    });

    return () => {
      active = false;
    };
  }, [value, size]);

  if (!dataUrl) return null;
  return <img src={dataUrl} alt={alt} className={className} />;
}

