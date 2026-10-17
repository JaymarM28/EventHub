import { Suspense } from "react";
import { CheckoutReturnClient } from "./checkout-return-client";

export default function CheckoutReturnPage() {
  return (
    <Suspense>
      <CheckoutReturnClient />
    </Suspense>
  );
}
