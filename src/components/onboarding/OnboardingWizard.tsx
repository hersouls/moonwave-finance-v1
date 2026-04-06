import { useState, useRef } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { WelcomeStep } from './steps/WelcomeStep'
import { MemberSetupStep } from './steps/MemberSetupStep'
import { FirstAssetStep } from './steps/FirstAssetStep'
import { CompletionStep } from './steps/CompletionStep'

interface OnboardingWizardProps {
  onComplete: () => void
}

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState(0)
  const prevStep = useRef(0)
  const shouldReduceMotion = useReducedMotion()

  const direction = step > prevStep.current ? 1 : -1

  const goTo = (next: number) => {
    prevStep.current = step
    setStep(next)
  }

  const steps = [
    <WelcomeStep key="welcome" onNext={() => goTo(1)} />,
    <MemberSetupStep key="members" onNext={() => goTo(2)} onBack={() => goTo(0)} />,
    <FirstAssetStep key="asset" onNext={() => goTo(3)} onBack={() => goTo(1)} />,
    <CompletionStep key="complete" onComplete={onComplete} />,
  ]

  const slideVariants = {
    enter: (d: number) => shouldReduceMotion
      ? { opacity: 0 }
      : { x: d > 0 ? 80 : -80, opacity: 0 },
    center: { x: 0, opacity: 1 },
    exit: (d: number) => shouldReduceMotion
      ? { opacity: 0 }
      : { x: d > 0 ? -80 : 80, opacity: 0 },
  }

  return (
    <div className="fixed inset-0 z-50 bg-surface-primary flex flex-col">
      {/* Progress */}
      <div className="flex gap-1.5 px-6 pt-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-1 flex-1 rounded-full bg-[var(--surface-tertiary)] overflow-hidden"
          >
            <motion.div
              className="h-full rounded-full bg-primary-500"
              initial={{ width: '0%' }}
              animate={{ width: i <= step ? '100%' : '0%' }}
              transition={shouldReduceMotion
                ? { duration: 0 }
                : { type: 'spring', stiffness: 200, damping: 25 }
              }
            />
          </div>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto relative">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={shouldReduceMotion
              ? { duration: 0.15 }
              : { type: 'spring', stiffness: 300, damping: 28 }
            }
          >
            {steps[step]}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
