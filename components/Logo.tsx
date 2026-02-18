import React from 'react';

interface LogoProps {
  className?: string;
  size?: number;
  showText?: boolean;
}

const Logo: React.FC<LogoProps> = ({ className = "", size = 40, showText = false }) => {
  // INSTRUCTIONS: Replace the null below with your image URL or Base64 string to use your custom logo.
  // Since the provided blob URL was private to your session, I've left this ready for you to paste the valid link.
  // Example: const customLogoUrl = "https://your-website.com/logo.png";
  const customLogoUrl: string | null = null; 

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      {customLogoUrl ? (
        <img 
          src={customLogoUrl} 
          alt="Aspire Homes Logo" 
          style={{ width: size, height: size, objectFit: 'contain' }}
          className="rounded-full bg-white/10"
        />
      ) : (
        /* Default Fallback Logo (Aspire Dots) */
        <svg
          width={size}
          height={size}
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="text-white"
        >
          <circle cx="50" cy="50" r="50" fill="#312E81" />
          
          <g fill="white">
             {/* Outer Ring */}
             <circle cx="50" cy="15" r="2.5" />
             <circle cx="68" cy="19" r="2.5" />
             <circle cx="81" cy="32" r="2.5" />
             <circle cx="85" cy="50" r="2.5" />
             <circle cx="81" cy="68" r="2.5" />
             <circle cx="68" cy="81" r="2.5" />
             <circle cx="50" cy="85" r="2.5" />
             <circle cx="32" cy="81" r="2.5" />
             <circle cx="19" cy="68" r="2.5" />
             <circle cx="15" cy="50" r="2.5" />
             <circle cx="19" cy="32" r="2.5" />
             <circle cx="32" cy="19" r="2.5" />

             {/* Mid Ring */}
             <circle cx="50" cy="24" r="2" />
             <circle cx="63" cy="27" r="2" />
             <circle cx="73" cy="37" r="2" />
             <circle cx="76" cy="50" r="2" />
             <circle cx="73" cy="63" r="2" />
             <circle cx="63" cy="73" r="2" />
             <circle cx="50" cy="76" r="2" />
             <circle cx="37" cy="73" r="2" />
             <circle cx="27" cy="63" r="2" />
             <circle cx="24" cy="50" r="2" />
             <circle cx="27" cy="37" r="2" />
             <circle cx="37" cy="27" r="2" />
             
             {/* Inner Ring */}
             <circle cx="50" cy="33" r="1.5" />
             <circle cx="59" cy="35" r="1.5" />
             <circle cx="65" cy="41" r="1.5" />
             <circle cx="67" cy="50" r="1.5" />
             <circle cx="65" cy="59" r="1.5" />
             <circle cx="59" cy="65" r="1.5" />
             <circle cx="50" cy="67" r="1.5" />
             <circle cx="41" cy="65" r="1.5" />
             <circle cx="35" cy="59" r="1.5" />
             <circle cx="33" cy="50" r="1.5" />
             <circle cx="35" cy="41" r="1.5" />
             <circle cx="41" cy="35" r="1.5" />
          </g>
        </svg>
      )}
      
      {showText && (
        <div className="text-center mt-4">
            <h1 className="text-3xl font-bold tracking-tight text-white leading-none">Aspire</h1>
            <h2 className="text-3xl font-bold tracking-tight text-white leading-none">Homes</h2>
        </div>
      )}
    </div>
  );
};

export default Logo;