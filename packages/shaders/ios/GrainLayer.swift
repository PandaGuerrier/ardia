import AppKit

final class GrainLayer: CALayer {
  static let side = 128
  static let arcDarkening: [String: (gain: Float, floor: Float)] = [
    "grain": (0.211, 0), "sand": (0.937, 0.132), "denim": (0.226, 0.068), "tweed": (0.23, 0.261),
  ]
  static let boost: Float = 1.5
  static let maxStrength: CGFloat = 1.5
  static let scaleRange: ClosedRange<CGFloat> = 0.5...3
  private static var tiles: [String: CGImage] = [:]
  private static var patterns: [String: CGColor] = [:]

  var texture = "grain" { didSet { if texture != oldValue { updatePattern() } } }
  var scale: CGFloat = 1 { didSet { if scale != oldValue { updatePattern() } } }
  private var boosted = false { didSet { if boosted != oldValue { updatePattern() } } }

  override init() {
    super.init()
    actions = ["bounds": NSNull(), "position": NSNull(), "opacity": NSNull(), "backgroundColor": NSNull()]
    updatePattern()
  }

  func setStrength(_ strength: CGFloat) {
    let s = min(max(strength, 0), Self.maxStrength)
    boosted = s > 1
    opacity = Float(boosted ? s / CGFloat(Self.boost) : s)
  }

  private func updatePattern() {
    backgroundColor = Self.pattern(texture, scale: scale, boosted: boosted)
  }

  override init(layer: Any) { super.init(layer: layer) }

  required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

  static func pattern(_ texture: String, scale: CGFloat = 1, boosted: Bool = false) -> CGColor? {
    let key = "\(texture)|\(boosted)|\(Int((scale * 100).rounded()))"
    if let cached = patterns[key] { return cached }
    let tileKey = "\(texture)|\(boosted)"
    guard let tile = tiles[tileKey] ?? tile(texture, gain: boosted ? boost : 1) else { return nil }
    tiles[tileKey] = tile
    let pixels = max(1, Int((CGFloat(side) * min(max(scale, scaleRange.lowerBound), scaleRange.upperBound)).rounded()))
    guard let sized = pixels == side ? tile : resampled(tile, to: pixels) else { return nil }
    let image = NSImage(cgImage: sized, size: NSSize(width: CGFloat(pixels) / 2, height: CGFloat(pixels) / 2))
    let color = NSColor(patternImage: image).cgColor
    if patterns.count > 64 { patterns.removeAll() }
    patterns[key] = color
    return color
  }

  static func resampled(_ tile: CGImage, to pixels: Int) -> CGImage? {
    guard let context = CGContext(data: nil, width: pixels, height: pixels, bitsPerComponent: 8, bytesPerRow: pixels * 4,
                                  space: CGColorSpace(name: CGColorSpace.sRGB)!,
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
    context.interpolationQuality = .none
    context.draw(tile, in: CGRect(x: 0, y: 0, width: pixels, height: pixels))
    return context.makeImage()
  }

  static func tile(_ texture: String, gain: Float = 1) -> CGImage? {
    let n = side
    var alpha = [Float](repeating: 0, count: n * n)
    var state: UInt32 = 0x9E3779B9
    func random() -> Float {
      state ^= state << 13
      state ^= state >> 17
      state ^= state << 5
      return Float(state % 10_000) / 10_000
    }
    func add(_ x: Int, _ y: Int, _ v: Float) {
      let i = ((y % n + n) % n) * n + (x % n + n) % n
      alpha[i] = min(1, alpha[i] + v)
    }
    switch texture {
    case "sand":
      for i in 0..<(n * n) { alpha[i] = random() * 0.25 }
      for _ in 0..<(n * n / 18) {
        let x = Int(random() * Float(n)), y = Int(random() * Float(n)), v = 0.5 + random() * 0.5
        add(x, y, v)
        add(x + 1, y, v * 0.6)
        add(x, y + 1, v * 0.6)
        add(x + 1, y + 1, v * 0.4)
      }
    case "denim":
      for y in 0..<n {
        for x in 0..<n {
          let twill: Float = (x + y) % 4 < 2 ? 0.75 : 0.15
          alpha[y * n + x] = min(1, twill * (0.6 + random() * 0.4) + (y % 2 == 0 ? 0.08 : 0))
        }
      }
    case "tweed":
      for i in 0..<(n * n) { alpha[i] = random() * 0.15 }
      for _ in 0..<(n * n / 40) {
        let x = Int(random() * Float(n)), y = Int(random() * Float(n)), v = 0.4 + random() * 0.6
        let horizontal = random() < 0.5
        for k in 0..<(3 + Int(random() * 4)) { horizontal ? add(x + k, y, v) : add(x, y + k, v) }
      }
    default:
      for i in 0..<(n * n) {
        let u = random()
        alpha[i] = u * u
      }
    }
    let match = arcDarkening[texture] ?? arcDarkening["grain"]!
    var bytes = [UInt8](repeating: 0, count: n * n * 4)
    for i in 0..<(n * n) { bytes[i * 4 + 3] = UInt8(min(255, max(0, (match.floor + match.gain * alpha[i]) * gain) * 255)) }
    guard let provider = CGDataProvider(data: Data(bytes) as CFData) else { return nil }
    return CGImage(width: n, height: n, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: n * 4,
                   space: CGColorSpace(name: CGColorSpace.sRGB)!,
                   bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
                   provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent)
  }
}
