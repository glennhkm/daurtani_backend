import wasteListingController from "../controllers/farmWasteController.js";
import { Hono } from "hono";
import { EnvBindings, HonoVariables } from "../types/hono.js";

const wasteListingRouter = new Hono<{ Bindings: EnvBindings; Variables: HonoVariables }>();

wasteListingRouter.get("/", wasteListingController.getAllWasteListings);
wasteListingRouter.post("/", wasteListingController.createWasteListing);

export default wasteListingRouter;