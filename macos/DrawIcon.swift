import AppKit

// Rasterize the same vector mark as assets/icon.svg at iconset resolutions.
let output = CommandLine.arguments[1]
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 1024, pixelsHigh: 1024,
                          bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true,
                          isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
let context = NSGraphicsContext.current!.cgContext
context.translateBy(x: 0, y: 1024)
context.scaleBy(x: 1, y: -1)
func color(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat) -> CGColor {
    CGColor(red: r / 255, green: g / 255, blue: b / 255, alpha: 1)
}
let cream = color(247, 242, 230)
let rose = color(229, 165, 174)
let background = CGPath(roundedRect: CGRect(x: 32, y: 32, width: 960, height: 960),
                        cornerWidth: 216, cornerHeight: 216, transform: nil)
context.saveGState()
context.addPath(background)
context.clip()
let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(),
    colors: [color(69, 110, 92), color(41, 76, 64)] as CFArray, locations: [0, 1])!
context.drawLinearGradient(gradient, start: CGPoint(x: 250, y: 32), end: CGPoint(x: 850, y: 992),
                           options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
context.restoreGState()
context.setStrokeColor(CGColor(gray: 1, alpha: 0.1))
context.setLineWidth(3)
context.addPath(CGPath(roundedRect: CGRect(x: 54, y: 54, width: 916, height: 916),
                      cornerWidth: 196, cornerHeight: 196, transform: nil))
context.strokePath()
context.translateBy(x: 1024, y: 0)
context.scaleBy(x: -1, y: 1)
context.setStrokeColor(cream)
context.setLineWidth(42)
context.setLineCap(.round)
context.setLineJoin(.round)
context.move(to: CGPoint(x: 324, y: 333))
context.addLine(to: CGPoint(x: 617, y: 333))
context.addCurve(to: CGPoint(x: 617, y: 501), control1: CGPoint(x: 729, y: 333), control2: CGPoint(x: 729, y: 501))
context.addLine(to: CGPoint(x: 407, y: 501))
context.addCurve(to: CGPoint(x: 407, y: 669), control1: CGPoint(x: 295, y: 501), control2: CGPoint(x: 295, y: 669))
context.addLine(to: CGPoint(x: 700, y: 669))
context.strokePath()
context.setLineWidth(32)
context.move(to: CGPoint(x: 324, y: 333))
context.addLine(to: CGPoint(x: 324, y: 269))
context.move(to: CGPoint(x: 700, y: 669))
context.addLine(to: CGPoint(x: 700, y: 733))
context.strokePath()
context.setFillColor(cream)
context.fillEllipse(in: CGRect(x: 273, y: 218, width: 102, height: 102))
context.setFillColor(rose)
context.fillEllipse(in: CGRect(x: 649, y: 682, width: 102, height: 102))
context.setStrokeColor(color(52, 90, 75))
context.setLineWidth(13)
context.addEllipse(in: CGRect(x: 482, y: 471, width: 60, height: 60))
context.drawPath(using: .fillStroke)
NSGraphicsContext.restoreGraphicsState()
try rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: output))
