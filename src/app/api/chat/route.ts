import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'messages is required' }, { status: 400 });
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'DEEPSEEK_API_KEY chưa được cấu hình' }, { status: 500 });
    }

    // === Query real data from database ===
    const [products, salesData, suppliers] = await Promise.all([
      // All products with category
      prisma.product.findMany({
        where: { isActive: true },
        include: { category: { select: { name: true } } },
        orderBy: { stock: 'asc' },
      }),

      // Sales in last 30 days - aggregated by product
      prisma.saleItem.groupBy({
        by: ['productId'],
        _sum: { quantity: true, totalPrice: true },
        _count: { id: true },
        where: {
          sale: {
            status: 'completed',
            saleDate: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          },
        },
        orderBy: { _sum: { quantity: 'desc' } },
      }),

      // Suppliers
      prisma.supplier.findMany({
        where: { isActive: true },
        select: { code: true, name: true, phone: true, debt: true },
      }),
    ]);

    // Build product map for sales lookup
    const productMap = new Map(products.map(p => [p.id, p]));

    // Format inventory data
    const inventoryText = products.map(p =>
      `- ${p.code} ${p.name} (${p.category.name}): tồn ${p.stock} ${p.unit}, giá vốn ${Math.round(p.costPrice).toLocaleString('vi-VN')}đ/${p.unit}, giá bán ${Math.round(p.salePrice).toLocaleString('vi-VN')}đ/${p.unit}, tồn tối thiểu ${p.minStock} ${p.unit}`
    ).join('\n');

    // Format sales data
    const salesText = salesData
      .filter(s => productMap.has(s.productId))
      .map(s => {
        const p = productMap.get(s.productId)!;
        return `- ${p.name}: bán ${s._sum.quantity} ${p.unit} (${s._count.id} đơn), doanh thu ${Math.round(s._sum.totalPrice || 0).toLocaleString('vi-VN')}đ`;
      }).join('\n');

    // Format suppliers
    const suppliersText = suppliers.map(s =>
      `- ${s.code} ${s.name}${s.phone ? ` (${s.phone})` : ''}: công nợ ${Math.round(s.debt).toLocaleString('vi-VN')}đ`
    ).join('\n');

    // Low stock alerts
    const lowStock = products.filter(p => p.stock <= p.minStock && p.minStock > 0);
    const lowStockText = lowStock.length > 0
      ? lowStock.map(p => `- ⚠️ ${p.name}: tồn ${p.stock} ${p.unit} (tối thiểu ${p.minStock} ${p.unit})`).join('\n')
      : '- Không có sản phẩm nào dưới mức tồn tối thiểu';

    const systemPrompt = `Bạn là trợ lý kiểm kho thông minh của cửa hàng gạo & nước An Khang. Bạn có quyền truy cập dữ liệu thực tế từ hệ thống.

DỮ LIỆU THỜI GIAN THỰC:

[HÀNG TỒN KHO - ${products.length} sản phẩm]
${inventoryText}

[DOANH SỐ 30 NGÀY QUA]
${salesText || '- Chưa có dữ liệu bán hàng'}

[CẢNH BÁO TỒN KHO THẤP]
${lowStockText}

[NHÀ CUNG CẤP]
${suppliersText || '- Chưa có nhà cung cấp'}

QUY TẮC:
1. Trả lời bằng tiếng Việt, thân thiện, gọn gàng
2. Khi gợi ý nhập hàng, LUÔN tính toán cụ thể: số lượng, giá dự kiến, tổng tiền
3. Ưu tiên hàng bán chạy + sắp hết trước
4. Khi có ngân sách giới hạn, phân bổ hợp lý và giải thích lý do
5. Sử dụng emoji vừa phải để dễ đọc
6. Nếu không đủ dữ liệu để trả lời, nói rõ thay vì đoán mò
7. Format số tiền theo kiểu Việt Nam (VD: 1.500.000đ)`;

    // Call DeepSeek API with streaming
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.slice(-10), // Keep last 10 messages for context
        ],
        stream: true,
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('DeepSeek API error:', err);
      return NextResponse.json({ error: 'Lỗi kết nối AI' }, { status: 500 });
    }

    // Stream the response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(line => line.startsWith('data: '));

            for (const line of lines) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  controller.enqueue(encoder.encode(content));
                }
              } catch {
                // Skip malformed JSON
              }
            }
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
