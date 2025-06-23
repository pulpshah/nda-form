// ============================================
// File Purpose: Renders the NDA form.
// Original Author: Uday Turakhia
// Last Updated By: Uday Turakhia
// Last Updated On: 06/23/2025
// ============================================

import NDAForm from '../components/NDAForm';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50" suppressHydrationWarning>
      <NDAForm />
    </div>
  );
}
