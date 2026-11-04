/**
 * CyberShield - User model
 *
 * - Email unique + normalized (lowercase, trimmed).
 * - Only a password hash is stored (bcryptjs), never a plain-text password.
 * - role defaults to "user" and is NOT assignable from public requests
 *   (mass-assignment protection lives in the auth route, which only reads
 *   name/email/password from the request body).
 * - toSafeJSON() strips the hash for any API response.
 */

import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required.'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters.'],
      maxlength: [80, 'Name must be at most 80 characters.'],
    },
    email: {
      type: String,
      required: [true, 'Email is required.'],
      unique: true,
      lowercase: true, // normalization
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email address.'],
    },
    passwordHash: {
      type: String,
      required: [true, 'Password is required.'],
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user', // public registration can never create an admin
    },
    lastLogin: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true } // createdAt + updatedAt managed by Mongoose
);

/** Safe public shape - the password hash is never serialized to clients. */
userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    role: this.role,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
    lastLogin: this.lastLogin,
  };
};

export const User = mongoose.model('User', userSchema);
export default User;
