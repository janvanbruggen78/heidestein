// utils/Kalman2D.ts
// Simple constant-velocity Kalman filter in 2D (meters).
// State x = [x, y, vx, vy]^T. Measurement z = [x, y]^T.

export type KfState = {
  x: Float64Array; // 4x1
  P: Float64Array; // 4x4
};

export class Kalman2D {
  private state: KfState | null = null;

  constructor(
    private readonly qAccel: number = 1.0, // process noise accel (m/s^2)
    private readonly gateMahalanobisSq: number = 9.0 // ~3σ gate
  ) {}

  /** Initialize at position (x,y) with large uncertainty. */
  init(x: number, y: number) {
    const X = new Float64Array([x, y, 0, 0]); // start stopped
    const P = new Float64Array([
      100, 0,   0,   0,
      0,   100, 0,   0,
      0,   0,   100, 0,
      0,   0,   0,   100,
    ]);
    this.state = { x: X, P };
  }

  /** Predict step with dt seconds. */
  predict(dt: number) {
    if (!this.state) return;
    const { x, P } = this.state;

    // F
    const F = [
      1, 0, dt, 0,
      0, 1, 0,  dt,
      0, 0, 1,  0,
      0, 0, 0,  1,
    ];

    // Q (discrete white-noise acceleration)
    const dt2 = dt * dt, dt3 = dt2 * dt, dt4 = dt2 * dt2;
    const q = this.qAccel;
    const q11 = q * dt4 / 4, q13 = q * dt3 / 2, q33 = q * dt2;
    const Q = [
      q11, 0,   q13, 0,
      0,   q11, 0,   q13,
      q13, 0,   q33, 0,
      0,   q13, 0,   q33,
    ];

    // x = F x
    const x0 = x[0], y0 = x[1], vx0 = x[2], vy0 = x[3];
    x[0] = x0 + dt * vx0;
    x[1] = y0 + dt * vy0;
    // v stays same

    // P = F P F^T + Q
    const FP = mul4x4(F, P);
    const FPFt = mul4x4(FP, transpose4(F));
    this.state.P = add4x4(FPFt, Q);
  }

  /**
   * Update with measurement z=[x,y] and measurement noise R = diag(var,var)
   * Returns true if update accepted (innovation passes gate), else false (rejected).
   */
  update(zx: number, zy: number, measStd: number): boolean {
    if (!this.state) { this.init(zx, zy); return true; }
    const { x, P } = this.state;
    const H = [
      1, 0, 0, 0,
      0, 1, 0, 0,
    ]; // 2x4
    const R = [
      measStd * measStd, 0,
      0, measStd * measStd,
    ]; // 2x2

    // y = z - Hx
    const zmx = zx - (x[0]);
    const zmy = zy - (x[1]);
    const yv = new Float64Array([zmx, zmy]); // 2x1

    // S = H P H^T + R  (2x2)
    const HP = mul2x4_4x4(H, P);        // 2x4
    const HPHt = mul2x4_4x2(HP, transpose4to4x2(H)); // 2x2
    const S = add2x2(HPHt, R);

    // Gate: y^T S^{-1} y  <= threshold
    const Sinv = inv2x2(S);
    const md2 = quadForm2(yv, Sinv);
    if (md2 > this.gateMahalanobisSq) {
      // reject update (likely outlier)
      return false;
    }

    // K = P H^T S^{-1}  (4x2)
    const PtHt = mul4x4_4x2(P, transpose4to4x2(H));
    const K = mul4x2_2x2(PtHt, Sinv); // 4x2

    // x = x + K y
    const Ky = mul4x2_2x1(K, yv); // 4x1
    x[0] += Ky[0]; x[1] += Ky[1]; x[2] += Ky[2]; x[3] += Ky[3];

    // P = (I - K H) P
    const KH = mul4x2_2x4(K, H); // 4x4
    const I = eye4();
    const IminusKH = sub4x4(I, KH);
    this.state.P = mul4x4(IminusKH, P);
    return true;
  }

  get current() {
    return this.state ? { x: this.state.x[0], y: this.state.x[1], vx: this.state.x[2], vy: this.state.x[3] } : null;
  }
}

/* ---------- tiny 4x4 / 2x2 helpers (unrolled for speed) ---------- */
function mul4x4(A: number[] | Float64Array, B: number[] | Float64Array): Float64Array {
  const r = new Float64Array(16);
  for (let i = 0; i < 4; i++) {
    const ai0 = A[i*4+0], ai1 = A[i*4+1], ai2 = A[i*4+2], ai3 = A[i*4+3];
    for (let j = 0; j < 4; j++) {
      r[i*4+j] = ai0*B[0*4+j] + ai1*B[1*4+j] + ai2*B[2*4+j] + ai3*B[3*4+j];
    }
  }
  return r;
}
function mul2x4_4x4(A2x4: number[] | Float64Array, B4x4: number[] | Float64Array): Float64Array {
  const r = new Float64Array(8);
  for (let i = 0; i < 2; i++) {
    const ai0 = A2x4[i*4+0], ai1 = A2x4[i*4+1], ai2 = A2x4[i*4+2], ai3 = A2x4[i*4+3];
    for (let j = 0; j < 4; j++) {
      r[i*4+j] = ai0*B[0*4+j] + ai1*B[1*4+j] + ai2*B[2*4+j] + ai3*B[3*4+j];
    }
  }
  return r;
}
function mul2x4_4x2(A2x4: Float64Array, B4x2: Float64Array): Float64Array {
  const r = new Float64Array(4);
  for (let i = 0; i < 2; i++) {
    const ai0 = A2x4[i*4+0], ai1 = A2x4[i*4+1], ai2 = A2x4[i*4+2], ai3 = A2x4[i*4+3];
    for (let j = 0; j < 2; j++) {
      r[i*2+j] = ai0*B[0*2+j] + ai1*B[1*2+j] + ai2*B[2*2+j] + ai3*B[3*2+j];
    }
  }
  return r;
}
function mul4x4_4x2(A4x4: Float64Array, B4x2: Float64Array): Float64Array {
  const r = new Float64Array(8);
  for (let i = 0; i < 4; i++) {
    const ai0 = A4x4[i*4+0], ai1 = A4x4[i*4+1], ai2 = A4x4[i*4+2], ai3 = A4x4[i*4+3];
    for (let j = 0; j < 2; j++) {
      r[i*2+j] = ai0*B[0*2+j] + ai1*B[1*2+j] + ai2*B[2*2+j] + ai3*B[3*2+j];
    }
  }
  return r;
}
function mul4x2_2x2(A4x2: Float64Array, B2x2: Float64Array): Float64Array {
  const r = new Float64Array(8);
  for (let i = 0; i < 4; i++) {
    const ai0 = A4x2[i*2+0], ai1 = A4x2[i*2+1];
    r[i*2+0] = ai0*B2x2[0] + ai1*B2x2[2];
    r[i*2+1] = ai0*B2x2[1] + ai1*B2x2[3];
  }
  return r;
}
function mul4x2_2x1(A4x2: Float64Array, b2x1: Float64Array): Float64Array {
  const r = new Float64Array(4);
  for (let i = 0; i < 4; i++) {
    r[i] = A4x2[i*2+0]*b2x1[0] + A4x2[i*2+1]*b2x1[1];
  }
  return r;
}
function transpose4(A: number[] | Float64Array): Float64Array {
  const r = new Float64Array(16);
  r[0]=A[0]; r[1]=A[4]; r[2]=A[8];  r[3]=A[12];
  r[4]=A[1]; r[5]=A[5]; r[6]=A[9];  r[7]=A[13];
  r[8]=A[2]; r[9]=A[6]; r[10]=A[10]; r[11]=A[14];
  r[12]=A[3];r[13]=A[7];r[14]=A[11]; r[15]=A[15];
  return r;
}
function transpose4to4x2(H: number[]): Float64Array {
  // H is 2x4; return 4x2
  return new Float64Array([
    H[0], H[4],
    H[1], H[5],
    H[2], H[6],
    H[3], H[7],
  ]);
}
function add4x4(A: Float64Array | number[], B: Float64Array | number[]): Float64Array {
  const r = new Float64Array(16);
  for (let i = 0; i < 16; i++) r[i] = (A as any)[i] + (B as any)[i];
  return r;
}
function sub4x4(A: Float64Array, B: Float64Array): Float64Array {
  const r = new Float64Array(16);
  for (let i = 0; i < 16; i++) r[i] = A[i] - B[i];
  return r;
}
function add2x2(A: Float64Array | number[], B: Float64Array | number[]): Float64Array {
  return new Float64Array([ (A as any)[0]+(B as any)[0], (A as any)[1]+(B as any)[1], (A as any)[2]+(B as any)[2], (A as any)[3]+(B as any)[3] ]);
}
function inv2x2(M: Float64Array): Float64Array {
  const [a,b,c,d] = [M[0],M[1],M[2],M[3]];
  const det = a*d - b*c || 1e-9;
  const s = 1/det;
  return new Float64Array([ d*s, -b*s, -c*s, a*s ]);
}
function quadForm2(y: Float64Array, A: Float64Array): number {
  // y^T A y
  const t0 = A[0]*y[0] + A[1]*y[1];
  const t1 = A[2]*y[0] + A[3]*y[1];
  return y[0]*t0 + y[1]*t1;
}
function eye4(): Float64Array {
  const I = new Float64Array(16);
  I[0]=1; I[5]=1; I[10]=1; I[15]=1;
  return I;
}
