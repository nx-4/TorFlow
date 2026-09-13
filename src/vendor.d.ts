declare module 'bencode' {
  const bencode: {
    decode(input: Buffer): unknown;
    encode(input: unknown): Buffer;
  };
  export default bencode;
}
