import { useState } from 'react'
import { WelcomeStep } from './steps/WelcomeStep'
import { MemberSetupStep } from './steps/MemberSetupStep'
import { FirstAssetStep } from './steps/FirstAssetStep'
import { CompletionStep } from './steps/CompletionStep'

interface OnboardingWizardProps {
  onComplete: () => void
}

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState(0)

  const steps = [
    <WelcomeStep key="welcome" onNext={() => setStep(1)} />,
    <MemberSetupStep key="members" onNext={() => setStep(2)} onBack={() => setStep(0)} />,
    <FirstAssetStep key="asset" onNext={() => setStep(3)} onBack={() => setStep(1)} />,
    <CompletionStep key="complete" onComplete={onComplete} />,
  ]

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-zinc-900 flex flex-col">
      {/* Progress */}
      <div className="flex gap-1.5 px-6 pt-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i <= step ? 'bg-primary-500' : 'bg-zinc-200 dark:bg-zinc-700'
            }`}
          />
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {steps[step]}
      </div>
    </div>
  )
}
