import { Suspense } from "react";
import { NewRequestPageContent } from "./NewRequestPageContent";

export default function NewRequestPage() {
  return (
    <Suspense fallback={null}>
      <NewRequestPageContent />
    </Suspense>
  );
}
