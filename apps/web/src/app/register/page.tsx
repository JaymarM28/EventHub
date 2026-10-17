import { Suspense } from "react";
import { RegisterClient } from "./register-client";

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterClient />
    </Suspense>
  );
}
