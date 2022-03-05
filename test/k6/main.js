import { navigateHomepage } from "./navigateHomepage.js";
import { addToCart } from "./addToCart.js";
import { navigateToCart } from "./navigateToCart.js";
import { navigateToCheckout } from "./navigateToCheckout.js";
import { updateAddress } from "./updateAddress.js";
import { submitCheckout } from "./submitCheckout.js";

export const options = {
  stages: [
    { duration: '5m', target: 100 },
    { duration: '10m', target: 1000 },
    { duration: '5m', target: 100 },
  ],
};

const vars = [];

// global min/max sleep durations (in seconds):
const pauseMin = 5;
const pauseMax = 15;

export default function main() {
  navigateHomepage();
  addToCart();
  navigateToCart();
  navigateToCheckout();
  updateAddress();
  submitCheckout();
}