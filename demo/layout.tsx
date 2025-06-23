import type { ReactNode } from "react";

export default function nda_agreementPageLayout({children}: {children : ReactNode}) {
  return (
    <div className="bg-gray-200 flex flex-col"> {/* Main Div */}
        <img src="" alt="" />
        <div> 
            {children}
        </div>
    </div>
  )
}