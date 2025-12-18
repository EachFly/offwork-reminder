from PIL import Image, ImageDraw
import os

def create_icon(size):
    # 创建图像
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # 绘制渐变圆形背景
    center = size // 2
    radius = int(size * 0.47)
    
    # 简化版：使用纯色替代渐变
    color = (102, 126, 234)  # #667eea
    draw.ellipse([center - radius, center - radius, 
                  center + radius, center + radius], 
                 fill=color)
    
    # 绘制时钟指针
    scale = size / 128
    line_width = max(1, int(5 * scale))
    
    # 时针 (指向12点)
    draw.line([(center, center), (center, center - int(32 * scale))], 
              fill='white', width=line_width)
    
    # 分针 (指向3点)
    line_width = max(1, int(4 * scale))
    draw.line([(center, center), (center + int(24 * scale), center)], 
              fill='white', width=line_width)
    
    # 中心点
    dot_radius = max(2, int(5 * scale))
    draw.ellipse([center - dot_radius, center - dot_radius,
                  center + dot_radius, center + dot_radius], 
                 fill='white')
    
    return img

# 创建 icons 目录
icons_dir = 'icons'
if not os.path.exists(icons_dir):
    os.makedirs(icons_dir)

# 生成不同尺寸的图标
sizes = [16, 48, 128]
for size in sizes:
    icon = create_icon(size)
    icon.save(f'{icons_dir}/icon{size}.png')
    print(f'Generated icon{size}.png')

print('\nAll icons generated successfully!')
