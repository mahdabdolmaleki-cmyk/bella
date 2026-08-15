import mongoose from "mongoose";
import { nextSequence } from "./Counter.js";

const messageSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true }, // unique already builds the index
    name: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { timestamps: true },
);

messageSchema.pre("save", async function () {
  if (this.id == null) this.id = await nextSequence("message");
});

messageSchema.methods.toDTO = function () {
  return {
    id: this.id,
    name: this.name,
    phone: this.phone,
    body: this.body,
    createdAt: this.createdAt,
  };
};

const Message = mongoose.model("Message", messageSchema);
export default Message;
