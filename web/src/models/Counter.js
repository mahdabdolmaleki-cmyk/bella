import mongoose from "mongoose";

/**
 * Simple auto-increment helper so Products / Orders / Messages keep the short
 * numeric ids the frontend already relies on (instead of long Mongo ObjectIds).
 */
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // e.g. "product", "order", "message"
  seq: { type: Number, default: 0 },
});

const Counter = mongoose.model("Counter", counterSchema);

export async function nextSequence(name) {
  const doc = await Counter.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { new: true, upsert: true },
  );
  return doc.seq;
}

export default Counter;
