import astroWorker from "./dist/_worker.js/index.js";
import { createGavelhouseWorker } from "./src/lib/worker-wrapper";

export default createGavelhouseWorker(astroWorker);
