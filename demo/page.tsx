// ============================================
// File Purpose: Handles NDA form submission and uploading NDA files to AWS S3, while preserving the original NDA form content and styling.
// Original Author: Brian Cao
// Last Updated By: Mohammed Ihtisham
// Last Updated On: 03/25/2025
// ============================================

'use client';
import React, { useState, useRef, useEffect } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import AWS from 'aws-sdk';
import { useRouter } from 'next/navigation';


const NDAForm = () => { 
  const router = useRouter();
  const [receivingParty, setReceivingParty] = useState('');
  const [individualAddress, setindividualAddress] = useState('');
  const [printName, setPrintName] = useState('');
  const [date, setDate] = useState('');
  const [requiredFields, setRequiredFields] = useState(true);

  //Use state to control signature of the recipient
  //checks if the required fields are filled out
  const canvasRef = useRef<SignatureCanvas>(null);

  // AWS S3 Configuration for NDA Upload
  AWS.config.update({
    accessKeyId: process.env.NEXT_PUBLIC_AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY,
    region: process.env.NEXT_PUBLIC_AWS_REGION,
  });

  const s3 = new AWS.S3();

  // Function to handle changes and validate letter inputs
  const handleInputChange = (setter: React.Dispatch<React.SetStateAction<string>>) => (e: React.ChangeEvent<HTMLInputElement>) => {
    if (setter == setDate) {
      let value = e.target.value;
      let parts = value.split("-");
      
      if (parts.length > 0 && parts[0].length > 4) {
        parts[0] = parts[0].slice(0, 4); // Restrict year to 4 digits
      }
      
      setDate(parts.join("-"));
    } else {
      const value = e.target.value;
      const filteredValue = value.replace(/[^A-Za-z\s]/g, ''); // Allow only letters and spaces
      setter(filteredValue);
    }
  };

  useEffect(() => {
    if (canvasRef.current) {
      canvasRef.current.clear(); // Clear the canvas on parameter change
    }
    if (!receivingParty || !individualAddress || !printName || !date ) {
      setRequiredFields(true);
      if (canvasRef.current) {
        canvasRef.current.clear(); // Clear the canvas
        canvasRef.current.off(); // Disable the canvas
      }
    } else {
      setRequiredFields(false);
      if (canvasRef.current) {
        canvasRef.current.on(); // Enable the canvas
      }
    }
  }, [receivingParty, individualAddress, printName, date]);
  
  // Function to upload the PDF to AWS S3
  const uploadToS3 = async (file: Blob) => {
    const params = {
      Bucket: process.env.NEXT_PUBLIC_S3_BUCKET_NAME!,
      Key: `nda-uploads/NDA_Agreement_${Date.now()}.pdf`, // Customize file name
      Body: file,
      ContentType: 'application/pdf',
    };
    try {
      const { Location } = await s3.upload(params).promise();
      alert(`File uploaded successfully to ${Location}`);
    } catch (error) {
      alert('Error uploading file.');
    }
  };


  const handleSubmit = async () => {
    if (requiredFields) {
      alert('Please fill out all required fields.');
      return;
    }
  
    const input = document.getElementById('printable');
    if (!input) return;
  
    const pdf = new jsPDF('p', 'px', 'letter');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
  
    const margin = 40;
    const contentWidth = pageWidth - 2 * margin;
    const contentHeight = pageHeight - 2 * margin;
  
    const originalHeight = input.style.height;
    const originalOverflow = input.style.overflow;
    input.style.height = 'auto';
    input.style.overflow = 'visible';
  
    const sections = Array.from(input.children);
    let position = margin;
  
    for (const section of sections) {
      const canvas = await html2canvas(section as HTMLElement, {
        scale: 1,
        useCORS: true,
        windowHeight: section.scrollHeight,
      });
  
      const imgData = canvas.toDataURL('image/jpeg', 0.8);
      const aspectRatio = canvas.width / canvas.height;
  
      const imgWidth = contentWidth;
      const imgHeight = imgWidth / aspectRatio;
  
      let heightLeft = imgHeight;
      let imageDataPrinted = 0;
  
      while (heightLeft > 0 && imageDataPrinted < 1) {
        const remainingPageHeight = contentHeight - (position - margin);
  
        if (remainingPageHeight <= 0 || remainingPageHeight < imgHeight) {
          pdf.addPage();
          position = margin;
        }
  
        const currentPageHeight = heightLeft;
  
        pdf.addImage(
          imgData,
          'JPEG',
          margin,
          position,
          imgWidth,
          currentPageHeight,
          undefined,
          'FAST'
        );
  
        imageDataPrinted++;
        heightLeft -= currentPageHeight;
        position += currentPageHeight;
      }
    }
  
    input.style.height = originalHeight;
    input.style.overflow = originalOverflow;
  
    const pdfBlob = pdf.output('blob');
  
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Data = reader.result?.toString().split(',')[1];
      if (!base64Data) {
        alert('Failed to prepare file for upload.');
        return;
      }
  
      try {
        const fileName = `nda-uploads/NDA_Agreement_${Date.now()}.pdf`;
        const fileType = 'application/pdf';
  
        const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file: base64Data, fileName, fileType }),
        });
  
        if (!uploadRes.ok) throw new Error('Upload failed');
  
        const { url } = await uploadRes.json();
        alert(`File uploaded successfully to ${url}`);
  
        const updateRes = await fetch('/api/account/update-nda', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ndaFileUrl: url }),
        });
  
        if (updateRes.ok) {
          console.log('NDA URL updated on user node.');
        } else {
          console.error('Failed to update NDA URL.');
        }
  
        const completeTaskRes = await fetch('/api/tasks/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Upload NDA Agreement', status: 'Completed' }),
        });
  
        if (completeTaskRes.ok) {
          console.log('NDA Task marked Completed!');
        } else {
          console.error('Failed to mark NDA Task as completed.');
        }
  
        // 🚀 Redirect to dashboard
        router.push('/dashboard');
  
      } catch (error) {
        console.error('Error:', error);
        alert('Something went wrong. Please try again.');
      }
    };
  
    reader.readAsDataURL(pdfBlob);
  };
  
  


  const handleDownloadPDF = async () => {
    const input = document.getElementById("printable");
  
    if (input) {
      const pdf = new jsPDF("p", "px", "letter");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const margin = 40; 
      const contentWidth = pageWidth - 2 * margin; 
      const contentHeight = pageHeight - 2 * margin; 
  
      const originalHeight = input.style.height;
      const originalOverflow = input.style.overflow;
      input.style.height = "auto";
      input.style.overflow = "visible";
     
      const sections = Array.from(input.children); 
  
      let position = margin; // Start at the top margin
  
      for (const section of sections) {
      
        const canvas = await html2canvas(section as HTMLElement, {
          scale: 1, 
          useCORS: true,
          windowHeight: section.scrollHeight, 
        });

        const imgData = canvas.toDataURL("image/jpeg", 0.8); 
        var imageDataPrinted = 0;
        const aspectRatio = canvas.width / canvas.height;
  
        const imgWidth = contentWidth;
        const imgHeight = imgWidth / aspectRatio;
  
        // If the section is too tall for the current page, split it into multiple pages
        let heightLeft = imgHeight;
        while (heightLeft > 0 && imageDataPrinted < 1) {
          
          const remainingPageHeight = contentHeight - (position - margin);
  
          // If the remaining space is not enough for the current section, move to the next page
          if (remainingPageHeight <= 0 || remainingPageHeight < imgHeight) {
            pdf.addPage();
            position = margin; // Reset 
          }
  
          // Calculate the height of the current page's content
          const currentPageHeight = heightLeft;
  
          // Add the image to the PDF with margins
          pdf.addImage(
            imgData,
            "JPEG", 
            margin,
            position, 
            imgWidth, 
            currentPageHeight, 
            undefined, 
            "FAST" 
          );
          imageDataPrinted++;
      
          heightLeft -= currentPageHeight;
          position += currentPageHeight;
        }
      }
  
      // Restore the original styles
      input.style.height = originalHeight;
      input.style.overflow = originalOverflow;

      pdf.save("NDA_Agreement.pdf");
    }
  };
  return (
    <div className="flex gap-8 p-8 text-black m-auto w-3/4">
      {/* Form Section */}
      <div className="w-1/2">
        <h1 className="text-2xl font-bold mb-4">Non-Disclosure Agreement</h1>
        <div className="mb-4">
          <label className="block text-sm font-medium">Receiving Party</label>
          <input
            type="text"
            className="w-full border rounded p-2 bg-white"
            pattern="[A-Za-z\s]+"
            value={receivingParty}
            onChange={handleInputChange(setReceivingParty)}
            maxLength={70}
            required
          />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium">Recipient&apos;s Address</label>
          <input
            type="text"
            className="w-full border rounded p-2 bg-white"
            value={individualAddress}
            onChange={(e) => setindividualAddress(e.target.value)}
            maxLength={100}
            required
          />
        </div>
        <div className='mb-4'>
          <label className='block text-sm font-medium'> Print Name</label>
          <input 
            type="text" 
            className="w-full border rounded p-2 bg-white"
            pattern="[A-Za-z\s]+" 
            value={printName} 
            onChange={handleInputChange(setPrintName)}
            maxLength={70}
            required
            
          />
        </div>
        <div className='mb-4'>
          <label className='block text-sm font-medium'>Print Date</label>
          <input 
            type="date" 
            className="w-full border rounded p-2 bg-white" 
            pattern="\d{4}-\d{2}-\d{2}"
            value={date} 
            onChange={handleInputChange(setDate)}
            max="2999-12-31"
            required
          />
        </div>
      </div>

      {/* Agreement Preview */}
      <div className='flex flex-col items-center justify-center'>
      <div  style= {{ backgroundColor: "white", color: "black", padding: "20px" }} id='printable' className="h-[750px] w-[850px] overflow-y-auto rounded-md bg-white p-8 shadow-lg text-sm">
        <div>
          <h2 className="text-xl font-bold mb-2">NON-DISCLOSURE AGREEMENT</h2>
          <br />
        </div>
        
        <div>
          <p>
            This Non-disclosure Agreement (this “Agreement”) is made as of December 26, 2024, by and between
            Pulp Internet Corporation (“Pulp” or the “Owner”), a Delaware corporation of 222 80th Street, Brooklyn,
            New York 11209, and individual <strong>{receivingParty || "[Recipient]"}</strong> with an address located
            at <strong>{individualAddress || "[Address of Individual]"}</strong>. Information will be disclosed to the Recipient to explore whether Recipient could assist Pulp with
            strategy and development plan. The Owner has requested and the Recipient agrees that the Recipient
            will protect the confidential material and information which may be disclosed between the Owner and
            the Recipient. Therefore, the parties agree as follows:
          </p>
          <br />
        </div>
        
        <div>
          <span className="block mt-4 font-bold">I. CONFIDENTIAL INFORMATION</span>
          <br />
        </div>
        
        <div>
          <p className="mt-2">The term “Confidential Information” means any information or material which is proprietary to the Owner, whether or not owned or developed by the Owner, which is not generally known other than by the Owner, and which the Recipient may obtain through any direct or indirect contact with the Owner. Regardless of whether specifically identified as confidential or proprietary, Confidential Information shall include any information provided by the Owner concerning the business, technology, and information of the Owner and any third party with which the Owner deals, including, without limitation, any mention of business records and plans, personal data including contact information and other information of a personal or sensitive nature, anticipated hiring and/or employee and executive compensation plans, trade secrets, technical data, product ideas, contracts, financial information, pricing structure, discounts, computer programs and listing, source code and/or object code, copyrights and intellectual property (including those with pending applications), inventions, sales leads, strategic alliances, partners, customers, investors, and client lists. The nature of the information and the manner of disclosure are such that a reasonable person would understand it to be confidential or of a sensitive nature.</p>
          <br />
          <div className='ml-4'>
            <span className="block mt-4 font-bold">Exclusions from Confidential Information</span>
            <p className="mt-2 italic">(a) publicly known at the time of disclosure or subsequently becomes publicly known through no fault of the Recipient</p>
            <p className="mt-2 italic">(b) discovered or created by the Recipient before disclosure by Discloser</p>
            <p className="mt-2 italic">(c) learned by the Recipient through legitimate means other than from the Discloser or Discloser’s representatives</p>
            <p className="mt-2 italic">(d) is disclosed by Recipient with Discloser&#39;s prior written approval.</p>
            <br />
          </div>
        </div>
        
        <div>
          <span className="block mt-4 font-bold">II. PROTECTION OF CONFIDENTIAL INFORMATION</span>
          <br />
        </div>
      
        <div>
          <p className="mt-2">The Recipient understands and acknowledges that the Confidential Information has been developed or obtained by the Owner by the investment of significant time, effort, and expense, and that the Confidential Information is a valuable, special, and unique asset of the Owner which provides the Owner with a significant competitive advantage, and needs to be protected from improper disclosure. In consideration for the receipt by the Recipient of the Confidential Information, the Recipient agrees as follows:</p>
          <br />
          <div className='ml-4'>
            <p><strong>1. No Disclosure.</strong> The Recipient will hold the Confidential Information in confidence and will not disclose the Confidential Information to any person or entity without the prior written consent of the Owner.</p>
            <p><strong>2. No Copying/Modifying.</strong> The Recipient will not copy, modify, attempt to otherwise replicate any Confidential Information without the prior written consent of the Owner.</p>
            <p><strong>3. Unauthorized Use.</strong> The Recipient shall promptly advise the Owner if the Recipient becomes aware of any possible unauthorized disclosure or use of the Confidential Information.</p>
            <p><strong>4. Application to Employees.</strong> The Recipient shall not disclose any Confidential Information to any employees of the Recipient or the Owner, except those employees who are required to have the Confidential Information in order to perform their job duties in connection with the limited purposes of this Agreement. Each permitted employee to whom Confidential Information is disclosed shall sign a non-disclosure agreement substantially the same as this Agreement at the request of the Owner.</p>
          </div>
          <br />
        </div>

        <div>
          <span className="block mt-4 font-bold">III. UNAUTHORIZED DISCLOSURE OF INFORMATION &ndash; INJUNCTION</span>
          <p className="mt-2">If it appears the Recipient has disclosed (or has threatened to disclose) Confidential Information in violation of this Agreement, the Owner shall be entitled to an injunction to restrain the Recipient from disclosing the Confidential Information in any context. The Owner shall not be prohibited by this provision from pursuing or exercising any rights or remedies available by law, including a claim for losses and damages.</p>
          <br />
        </div>
        
        <div>
          <span className="block mt-4 font-bold">IV. NON-CIRCUMVENTION</span>
          <p className="mt-2">For a period of five (5) years after the end of the term of this Agreement, the Recipient will not attempt to do business with, or otherwise solicit any business contacts found or otherwise referred by the Owner to the Recipient for the purposes of circumventing, the result of which shall be to prevent the Owner from closing or realizing any sales, profits, fees, debt and/or equity funding, or otherwise, without the specific written approval of the Owner. If such circumvention shall occur, the Owner shall be entitled to any monies due pursuant to this agreement or relating to such transaction.</p>
          <br />
        </div>
       
        <div>
          <span className="block mt-4 font-bold">V. RETURN OF CONFIDENTIAL INFORMATION</span>
          <p className="mt-2">Upon the written request of the Owner, the Recipient shall return to the Owner all written and digital materials containing Confidential Information. The Recipient shall also deliver to the Owner written statements signed by the Recipient certifying that all materials have been returned within five (5) days of receipt of the request.</p>
          <br />
        </div>

        <div>
          <span className="block mt-4 font-bold">VI. RELATIONSHIP OF PARTIES</span>
          <p className="mt-2">Neither party has an obligation under this Agreement to purchase or provide any service or item from the other party, or commercially offer any products using or incorporating the Confidential Information. This Agreement does not create any agency, partnership, or joint venture.</p>
          <br />
        </div>
        

        <div>
          <span className="block mt-4 font-bold">VII. NO WARRANTY</span>
          <p className="mt-2">The Recipient acknowledges and agrees that the Confidential Information is provided on an “AS IS” basis. THE OWNER MAKES NO WARRANTIES, EXPRESS OR IMPLIED, WITH RESPECT TO THE CONFIDENTIAL INFORMATION AND HEREBY EXPRESSLY DISCLAIMS ANY AND ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE. IN NO EVENT SHALL THE OWNER BE LIABLE FOR ANY DIRECT, INDIRECT, SPECIAL, OR CONSEQUENTIAL DAMAGES IN CONNECTION WITH OR ARISING OUT OF THE PERFORMANCE OR USE OF ANY PORTION OF THE CONFIDENTIAL INFORMATION. The Owner does not represent or warrant that any product or business plan disclosed to the Recipient will be marketed or carried out as disclosed, or at all. Any actions taken by the Recipient in response to the disclosure of the Confidential Information shall be solely at the risk of the Recipient.</p>
          <br />
        </div>

        <div>
          <span className="block mt-4 font-bold">VIII. LIMITED LICENSE TO USE</span>
          <p className="mt-2">The Recipient shall not acquire any intellectual property rights under this Agreement except the limited right to use as set forth above. The Recipient acknowledges that, as between the Owner and the Recipient, the Confidential Information and all related copyrights and intellectual property rights (including those with pending applications) are (and at all times will be) the property of the Owner, even if suggestions, comments, and/or ideas made by the Recipient are incorporated into the Confidential Information or related materials during the period of this Agreement.</p>
          <br />
        </div>

        <div>
          <span className="block mt-4 font-bold">IX. ATTORNEY’S FEES</span>
          <p className="mt-2">In any legal action between the parties concerning this Agreement, the prevailing party shall be entitled to recover reasonable attorney’s fees and costs.</p>
          <br />
        </div>

        <div>
          <span className="block mt-4 font-bold">X. TERM</span>
          <p className="mt-2">TERM. The obligations of this Agreement shall survive twelve (12) months from the Effective Date or until the Owner sends the Recipient written notice releasing the Recipient from this Agreement. After that, the Recipient must continue to protect the Confidential Information that was received during the term of this Agreement from unauthorized use or disclosure for an additional twenty-four (24) months.</p>
          <br />
        </div>

        <div>
          <span className="block mt-4 font-bold">XI. GENERAL PROVISIONS</span>
          <p className="mt-2">This agreement sets forth the entire understanding of the parties regarding confidentiality. Any amendments must be in writing and signed by both parties. This Agreement shall be construed under the laws of the State of New York. This Agreement shall not be assignable by either party. Neither party may delegate its duties under this Agreement without the prior written consent of the other party. The confidentiality provisions of this Agreement shall remain in full force and effect at all times in accordance with the term of this Agreement. If any provision of this Agreement is held to be invalid, illegal, or unenforceable, the remaining portions of this Agreement shall remain in full force and effect and construed so as to best effectuate the original intent of this Agreement.</p>
          <br />
        </div>

        <div>
          <span className="block mt-4 font-bold">XII. WHISTLEBLOWER PROTECTION</span>
          <p className="mt-2">This Agreement is in compliance with the Defend Trade Secrets Act and provides civil or criminal immunity to any individual for the disclosure of trade secrets, provided said disclosure is: (i) made in confidence to a federal, state, or local government official, or to an attorney when the disclosure is to report suspected violations of the law; or (ii) in a complaint or other document in a lawsuit if made under seal.</p>
          <br />
        </div>

        <div>
          <span className="block mt-4 font-bold">XIII. SIGNATORIES</span>
          <p className="mt-2">This agreement shall be executed by Pulp Internet Corporation and Recipient and delivered in the manner prescribed by law as of the date written above.</p>
          <br />
        </div>

       
        <div className='flex flex-row '>
          <div className='w-1/2 mt-4 font-bold'> {/*Shahs Signature*/}
            <div className='mb-4 flex flex-row'>
              <label className='pt-10 pr-2'> Pulp Signature:</label>
              <div>
                <SignatureCanvas 
                backgroundColor='#F3F4F6' 
                canvasProps={{ width: 200, height: 50 }
                
              }  
              />
              </div>
              
            </div>
          </div>
          <div className='w-1/2 mt-4 font-bold py-2'> {/*Recipient's signature*/}
            <div className='mb-4 flex flex-row'>
              <label className='pt-10 pr-2'>Recipient Signature:</label>
              <SignatureCanvas
                ref={canvasRef} 
                backgroundColor='#F3F4F6' 
                canvasProps={{ width: 200, height: 50 }}  
              />
            </div>
            <label>Print Name: {printName || "[Name]"}</label>
            <br />
            <label>Date: {date || "[Date]"}</label>
            
            <br />
          </div>
          
          
        </div>
        
      </div>
      
      <button
        className="bg-blue-500 text-white px-4 py-2 rounded mt-4"
        onClick={handleDownloadPDF}
      >
        Download PDF
      </button>

      <button
        className="bg-blue-500 text-white px-4 py-2 rounded mt-4"
        onClick={handleSubmit}
      >
        Submit
      </button>
      
      </div>
    </div>
  );
};

export default NDAForm;