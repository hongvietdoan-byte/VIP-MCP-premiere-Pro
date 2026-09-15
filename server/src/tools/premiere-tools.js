// premiere-tools.js — General-purpose Premiere Pro tools via Beat Shake MCP bridge
// Groups: Project/File, Timeline Editing, Voice Cleanup, FX Console, Audio Mixing,
//         Transitions, Color Grading, Captions, Clip Speed, Bin Management,
//         Selection, Scene Detection, Metadata, MOGRT, Export, AI Transcription

export const PREMIERE_TOOLS = [

  // ==========================================================================
  // GROUP 1 — Project & File
  // ==========================================================================
  {
    name: 'get_project_info',
    description: 'Lấy thông tin project Premiere đang mở: tên, đường dẫn, danh sách sequence, danh sách bin.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    execute(wsBridge) {
      return wsBridge.sendCommand('get_project_info', {}, 15000);
    }
  },

  {
    name: 'save_project',
    description: 'Lưu project Premiere đang mở (ghi đè file .prproj hiện tại).',
    inputSchema: { type: 'object', properties: {}, required: [] },
    execute(wsBridge) {
      return wsBridge.sendCommand('save_project', {}, 20000);
    }
  },

  {
    name: 'save_project_as',
    description: 'Lưu project đang mở sang 1 đường dẫn .prproj mới.',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Đường dẫn tuyệt đối file .prproj mới.' }
      },
      required: ['filePath']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('save_project_as', { filePath: args.filePath }, 20000);
    }
  },

  {
    name: 'import_files',
    description: 'Import file vào Project panel của Premiere Pro. Hỗ trợ video, audio, ảnh, subtitle, MOGRT. Tùy chọn chỉ định bin đích. Trả về danh sách file đã import thành công và file bị bỏ qua (đã tồn tại hoặc lỗi).',
    inputSchema: {
      type: 'object',
      properties: {
        paths: {
          type: 'array',
          description: 'Mảng đường dẫn tuyệt đối đến file cần import, ví dụ ["C:\\\\Users\\\\NC\\\\video.mp4"].',
          items: { type: 'string' }
        },
        binName: {
          type: 'string',
          description: 'Tên bin đích trong Project panel. Để trống thì import vào root của project.'
        }
      },
      required: ['paths']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('import_files', { paths: args.paths, binName: args.binName }, 30000);
    }
  },

  {
    name: 'open_project',
    description: 'Mở file project Premiere (.prproj) từ đường dẫn chỉ định. Premiere sẽ đóng project hiện tại trước khi mở cái mới.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Đường dẫn tuyệt đối đến file .prproj.' }
      },
      required: ['path']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('open_project', { path: args.path }, 30000);
    }
  },

  // ==========================================================================
  // GROUP 2 — Timeline Editing
  // ==========================================================================
  {
    name: 'cut_clip_at_time',
    description: 'Cắt (razor) tất cả clip trên timeline tại thời điểm chỉ định. Mặc định cắt tại vị trí CTI (playhead) hiện tại. Yêu cầu QE DOM — nếu không có sẽ báo lỗi rõ.',
    inputSchema: {
      type: 'object',
      properties: {
        timeSeconds: {
          type: 'number',
          description: 'Thời điểm cắt tính bằng giây. Bỏ trống = dùng vị trí CTI hiện tại.'
        },
        trackType: {
          type: 'string',
          description: '"video" | "audio" | "all" (mặc định "all"). Chỉ cắt track thuộc loại này.',
          enum: ['video', 'audio', 'all']
        }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('cut_clip_at_time', {
        timeSeconds: args.timeSeconds,
        trackType: args.trackType ?? 'all'
      }, 20000);
    }
  },

  {
    name: 'trim_clip',
    description: 'Chỉnh in-point hoặc out-point của clip đang chọn trên timeline. Truyền inSeconds, outSeconds, hoặc cả hai. Thời gian tính theo sequence time (giây từ đầu sequence).',
    inputSchema: {
      type: 'object',
      properties: {
        inSeconds: {
          type: 'number',
          description: 'In-point mới của clip (giây theo sequence time). Bỏ trống = giữ nguyên in-point hiện tại.'
        },
        outSeconds: {
          type: 'number',
          description: 'Out-point mới của clip (giây theo sequence time). Bỏ trống = giữ nguyên out-point hiện tại.'
        }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('trim_clip', { inSeconds: args.inSeconds, outSeconds: args.outSeconds }, 20000);
    }
  },

  {
    name: 'delete_clip',
    description: 'Xóa clip đang chọn khỏi timeline. Ripple=false (mặc định): xóa và để gap. Ripple=true: xóa và kéo các clip sau sang trái để lấp gap.',
    inputSchema: {
      type: 'object',
      properties: {
        ripple: {
          type: 'boolean',
          description: 'true = ripple delete (lấp gap), false = chỉ xóa clip (mặc định false).'
        }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('delete_clip', { ripple: args.ripple === true }, 20000);
    }
  },

  {
    name: 'ripple_delete',
    description: 'Xóa khoảng trống (gap) trên timeline trong một khoảng thời gian chỉ định, đồng thời kéo tất cả clip sau đó sang trái để lấp đầy. Ưu tiên dùng QE DOM, fallback về manual shift. CRITICAL: Nếu xử lý nhiều vùng, plugin tự động làm từ cuối về đầu để timestamp không lệch.',
    inputSchema: {
      type: 'object',
      properties: {
        startSeconds: {
          type: 'number',
          description: 'Bắt đầu vùng cần xóa (giây). Bỏ trống = dùng in-point clip đang chọn.'
        },
        endSeconds: {
          type: 'number',
          description: 'Kết thúc vùng cần xóa (giây). Bỏ trống = dùng out-point clip đang chọn.'
        }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('ripple_delete', {
        startSeconds: args.startSeconds,
        endSeconds: args.endSeconds
      }, 30000);
    }
  },

  {
    name: 'roll_edit',
    description: 'Dời điểm cắt chung giữa 2 clip liền kề trên cùng 1 track (kéo dài clip trái, rút ngắn clip phải hoặc ngược lại), giữ nguyên vị trí clip khác. Cần đúng 2 clip liền kề tại editTimeSeconds.',
    inputSchema: {
      type: 'object',
      properties: {
        trackIndex: { type: 'number', description: 'Index track chứa 2 clip (0-based).' },
        trackType: { type: 'string', enum: ['video', 'audio'], description: 'Mặc định "video".' },
        editTimeSeconds: { type: 'number', description: 'Vị trí điểm cắt hiện tại (giây) giữa 2 clip.' },
        newTimeSeconds: { type: 'number', description: 'Vị trí điểm cắt mới (giây).' }
      },
      required: ['trackIndex', 'editTimeSeconds', 'newTimeSeconds']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('roll_edit', {
        trackIndex: args.trackIndex, trackType: args.trackType,
        editTimeSeconds: args.editTimeSeconds, newTimeSeconds: args.newTimeSeconds
      }, 15000);
    }
  },

  {
    name: 'slip_edit',
    description: 'Dịch cả in/out điểm nguồn của clip đang chọn (đổi nội dung hiển thị) nhưng GIỮ NGUYÊN vị trí và thời lượng trên timeline — khác trim_clip (đổi cả vị trí/thời lượng).',
    inputSchema: {
      type: 'object',
      properties: {
        offsetSeconds: { type: 'number', description: 'Độ lệch (giây) áp cho cả in-point và out-point nguồn. Dương = lùi nội dung về sau.' }
      },
      required: ['offsetSeconds']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('slip_edit', { offsetSeconds: args.offsetSeconds }, 15000);
    }
  },

  {
    name: 'move_clip',
    description: 'Di chuyển clip đang chọn đến vị trí thời gian mới trên timeline. Truyền startSeconds để set thời điểm bắt đầu mới, tùy chọn trackIndex để đổi track.',
    inputSchema: {
      type: 'object',
      properties: {
        startSeconds: {
          type: 'number',
          description: 'Thời điểm bắt đầu mới của clip (giây theo sequence time).'
        },
        trackIndex: {
          type: 'number',
          description: 'Index của track đích (0-based). Bỏ trống = giữ nguyên track hiện tại.'
        }
      },
      required: ['startSeconds']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('move_clip', {
        startSeconds: args.startSeconds,
        trackIndex: args.trackIndex
      }, 20000);
    }
  },

  // ==========================================================================
  // GROUP 3 — Voice Cleanup
  // ==========================================================================
  {
    name: 'detect_silence_regions',
    description: 'Phân tích clip audio đang chọn, tìm các vùng im lặng (dưới ngưỡng dB) có thời lượng tối thiểu. Chỉ đọc, không thay đổi timeline. Dùng để preview trước khi xóa.',
    inputSchema: {
      type: 'object',
      properties: {
        thresholdDb: {
          type: 'number',
          description: 'Ngưỡng biên độ (dBFS). Vùng dưới ngưỡng này được coi là im lặng. Mặc định -40 dBFS.'
        },
        minDurationMs: {
          type: 'number',
          description: 'Thời lượng tối thiểu của vùng im lặng tính bằng mili-giây. Mặc định 300ms — lọc bỏ những khoảng ngắt hơi ngắn.'
        }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('detect_silence_regions', {
        thresholdDb: args.thresholdDb ?? -40,
        minDurationMs: args.minDurationMs ?? 300
      }, 60000);
    }
  },

  {
    name: 'remove_silence_gaps',
    description: 'Dọn dẹp voice clip: tìm vùng im lặng rồi cắt và ripple delete để loại bỏ khoảng trống. autoApply=false (mặc định) chỉ trả về danh sách vùng sẽ bị xóa để review. autoApply=true thực hiện cắt thật — không thể undo tự động.',
    inputSchema: {
      type: 'object',
      properties: {
        thresholdDb: {
          type: 'number',
          description: 'Ngưỡng im lặng dBFS. Mặc định -40.'
        },
        minDurationMs: {
          type: 'number',
          description: 'Thời lượng tối thiểu vùng im lặng cần xóa (ms). Mặc định 300.'
        },
        autoApply: {
          type: 'boolean',
          description: 'false (mặc định): chỉ trả preview danh sách vùng silence. true: thực sự cắt và ripple delete. Luôn preview trước, xác nhận với user rồi mới autoApply=true.'
        }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('remove_silence_gaps', {
        thresholdDb: args.thresholdDb ?? -40,
        minDurationMs: args.minDurationMs ?? 300,
        autoApply: args.autoApply === true
      }, 120000);
    }
  },

  // ==========================================================================
  // GROUP 4 — FX Console: Effect Search & Apply
  // ==========================================================================
  {
    name: 'search_effects',
    description: 'Tìm kiếm effect Premiere Pro theo tên hoặc từ khóa. Trả về displayName, matchName (dùng để apply), và category. Nếu Premiere đang mở và plugin đã nối, ưu tiên danh sách THẬT trên máy (kể cả effect bên thứ 3); nếu không, rơi về database offline ~250 effects chuẩn ADBE.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Từ khóa tìm kiếm, ví dụ "blur", "color", "gaussian", "lumetri". Không phân biệt hoa thường.'
        },
        limit: {
          type: 'number',
          description: 'Số kết quả tối đa trả về. Mặc định 20.',
          minimum: 1,
          maximum: 100
        }
      },
      required: ['query']
    },
    async execute(wsBridge, args) {
      const { EFFECTS_DB } = await import('../data/premiere-effects.js');
      const q = (args.query ?? '').toLowerCase();

      // Ưu tiên danh sách THẬT của máy đang chạy (qua plugin, kể cả effect bên thứ 3) —
      // database tĩnh chỉ dùng làm fallback khi Premiere chưa mở, hoặc để có category đẹp
      // cho các effect chuẩn ADBE mà QE DOM không phân loại.
      let source = EFFECTS_DB;
      if (wsBridge.isConnected()) {
        try {
          const live = await wsBridge.sendCommand('list_installed_effects', {}, 15000);
          if (live?.effects?.length) {
            const staticByName = new Map(EFFECTS_DB.map(e => [e.displayName.toLowerCase(), e]));
            source = live.effects.map(e => staticByName.get(e.displayName.toLowerCase()) ?? e);
          }
        } catch { /* plugin không phản hồi kịp -- rơi về database tĩnh, không chặn tool */ }
      }

      const results = source.filter(e =>
        (e.displayName ?? '').toLowerCase().includes(q) ||
        (e.matchName ?? '').toLowerCase().includes(q) ||
        (e.category ?? '').toLowerCase().includes(q)
      ).slice(0, args.limit ?? 20);
      return { effects: results, total: results.length, query: args.query, source: source === EFFECTS_DB ? 'static' : 'live' };
    }
  },

  {
    name: 'apply_effect',
    description: 'Áp dụng effect lên clip đang chọn trong Premiere Pro. Dùng matchName từ search_effects để chỉ định chính xác effect. Trả về componentIndex của effect vừa thêm để dùng với set_effect_param.',
    inputSchema: {
      type: 'object',
      properties: {
        matchName: {
          type: 'string',
          description: 'FilterMatchName của effect, ví dụ "ADBE Gaussian Blur 2", "ADBE Fast Color Corrector". Dùng search_effects để tìm matchName đúng.'
        }
      },
      required: ['matchName']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('apply_effect', { matchName: args.matchName }, 20000);
    }
  },

  {
    name: 'get_clip_effects',
    description: 'Lấy danh sách effect đang có trên clip đang chọn: displayName, matchName, enabled/disabled, số parameter. Dùng để biết matchName chính xác trước khi gọi set_effect_param hoặc remove_effect.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    execute(wsBridge) {
      return wsBridge.sendCommand('get_clip_effects', {}, 15000);
    }
  },

  {
    name: 'set_effect_param',
    description: 'Set giá trị parameter của effect trên clip đang chọn. Nếu truyền timeSeconds thì đặt keyframe, không truyền thì set static value. Dùng get_clip_effects để lấy matchName đúng.',
    inputSchema: {
      type: 'object',
      properties: {
        matchName: {
          type: 'string',
          description: 'FilterMatchName của effect trên clip (lấy từ get_clip_effects).'
        },
        paramName: {
          type: 'string',
          description: 'Tên hiển thị của parameter, ví dụ "Blurriness", "Exposure", "Saturation".'
        },
        value: {
          description: 'Giá trị mới (number hoặc string tùy param).'
        },
        timeSeconds: {
          type: 'number',
          description: 'Thời điểm đặt keyframe (giây theo sequence time). Bỏ trống = set static không keyframe.'
        }
      },
      required: ['matchName', 'paramName', 'value']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('set_effect_param', {
        matchName: args.matchName,
        paramName: args.paramName,
        value: args.value,
        timeSeconds: args.timeSeconds
      }, 20000);
    }
  },

  {
    name: 'get_keyframes',
    description: 'Đọc danh sách keyframe hiện có trên 1 parameter của effect trên clip đang chọn (thời gian tính theo giây tương đối trong clip, 0 = đầu clip).',
    inputSchema: {
      type: 'object',
      properties: {
        matchName: { type: 'string', description: 'FilterMatchName của effect trên clip (lấy từ get_clip_effects).' },
        paramName: { type: 'string', description: 'Tên hiển thị của parameter, ví dụ "Scale", "Opacity".' }
      },
      required: ['matchName', 'paramName']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('get_keyframes', { matchName: args.matchName, paramName: args.paramName }, 15000);
    }
  },

  {
    name: 'remove_keyframe',
    description: 'Xoá 1 keyframe tại thời điểm cụ thể trên 1 parameter của clip đang chọn.',
    inputSchema: {
      type: 'object',
      properties: {
        matchName: { type: 'string', description: 'FilterMatchName của effect trên clip.' },
        paramName: { type: 'string', description: 'Tên hiển thị của parameter.' },
        timeSeconds: { type: 'number', description: 'Thời điểm keyframe cần xoá (giây, tương đối trong clip).' }
      },
      required: ['matchName', 'paramName', 'timeSeconds']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('remove_keyframe', {
        matchName: args.matchName, paramName: args.paramName, timeSeconds: args.timeSeconds
      }, 15000);
    }
  },

  {
    name: 'remove_keyframe_range',
    description: 'Xoá toàn bộ keyframe trong 1 khoảng thời gian trên 1 parameter của clip đang chọn.',
    inputSchema: {
      type: 'object',
      properties: {
        matchName: { type: 'string', description: 'FilterMatchName của effect trên clip.' },
        paramName: { type: 'string', description: 'Tên hiển thị của parameter.' },
        startSeconds: { type: 'number', description: 'Bắt đầu khoảng cần xoá (giây, tương đối trong clip).' },
        endSeconds: { type: 'number', description: 'Kết thúc khoảng cần xoá (giây, tương đối trong clip).' }
      },
      required: ['matchName', 'paramName', 'startSeconds', 'endSeconds']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('remove_keyframe_range', {
        matchName: args.matchName, paramName: args.paramName, startSeconds: args.startSeconds, endSeconds: args.endSeconds
      }, 15000);
    }
  },

  {
    name: 'get_value_at_time',
    description: 'Đọc giá trị nội suy (interpolated) của 1 parameter tại 1 thời điểm cụ thể trên clip đang chọn. Bỏ trống timeSeconds để đọc giá trị tại in-point.',
    inputSchema: {
      type: 'object',
      properties: {
        matchName: { type: 'string', description: 'FilterMatchName của effect trên clip.' },
        paramName: { type: 'string', description: 'Tên hiển thị của parameter.' },
        timeSeconds: { type: 'number', description: 'Thời điểm cần đọc (giây, tương đối trong clip). Bỏ trống = đầu clip.' }
      },
      required: ['matchName', 'paramName']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('get_value_at_time', {
        matchName: args.matchName, paramName: args.paramName, timeSeconds: args.timeSeconds
      }, 15000);
    }
  },

  {
    name: 'set_keyframe_interpolation',
    description: 'Đổi kiểu interpolation (linear/bezier hoặc hold) của 1 keyframe đã có, tại 1 thời điểm cụ thể trên clip đang chọn.',
    inputSchema: {
      type: 'object',
      properties: {
        matchName: { type: 'string', description: 'FilterMatchName của effect trên clip.' },
        paramName: { type: 'string', description: 'Tên hiển thị của parameter.' },
        timeSeconds: { type: 'number', description: 'Thời điểm keyframe cần đổi (giây, tương đối trong clip).' },
        mode: { type: 'string', enum: ['bezier', 'hold'], description: '"bezier" (mặc định, mượt) hoặc "hold" (giữ nguyên không chuyển tiếp).' }
      },
      required: ['matchName', 'paramName', 'timeSeconds']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('set_keyframe_interpolation', {
        matchName: args.matchName, paramName: args.paramName, timeSeconds: args.timeSeconds, mode: args.mode
      }, 15000);
    }
  },

  {
    name: 'remove_effect',
    description: 'Xóa effect khỏi clip đang chọn theo matchName. Dùng get_clip_effects để xem danh sách effect hiện có.',
    inputSchema: {
      type: 'object',
      properties: {
        matchName: {
          type: 'string',
          description: 'FilterMatchName của effect cần xóa (lấy từ get_clip_effects).'
        }
      },
      required: ['matchName']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('remove_effect', { matchName: args.matchName }, 15000);
    }
  },

  // ==========================================================================
  // GROUP 5 — Audio Mixing
  // ==========================================================================
  {
    name: 'set_clip_volume',
    description: 'Điều chỉnh âm lượng clip audio đang chọn theo đơn vị dBFS. 0 dB = giữ nguyên, -6 dB = giảm nửa, +6 dB = tăng gấp đôi.',
    inputSchema: {
      type: 'object',
      properties: {
        gainDb: {
          type: 'number',
          description: 'Giá trị gain tính bằng dB (-60 đến +15). 0 = không đổi.'
        }
      },
      required: ['gainDb']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('set_clip_volume', { gainDb: args.gainDb }, 15000);
    }
  },

  {
    name: 'set_clip_pan',
    description: 'Điều chỉnh pan (trái-phải) của clip audio đang chọn. -100 = hoàn toàn trái, 0 = center, +100 = hoàn toàn phải.',
    inputSchema: {
      type: 'object',
      properties: {
        panValue: {
          type: 'number',
          description: 'Giá trị pan (-100 đến +100). 0 = center.',
          minimum: -100,
          maximum: 100
        }
      },
      required: ['panValue']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('set_clip_pan', { panValue: args.panValue }, 15000);
    }
  },

  {
    name: 'mute_track',
    description: 'Mute hoặc unmute một audio track theo trackIndex trong sequence đang active.',
    inputSchema: {
      type: 'object',
      properties: {
        trackIndex: {
          type: 'number',
          description: 'Index của audio track (0-based).'
        },
        muted: {
          type: 'boolean',
          description: 'true = mute, false = unmute.'
        }
      },
      required: ['trackIndex', 'muted']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('mute_track', { trackIndex: args.trackIndex, muted: args.muted }, 10000);
    }
  },

  {
    name: 'get_track_info',
    description: 'Đọc thông tin 1 track cụ thể (tên, mute, số clip) trong sequence đang active. LƯU Ý: không có API lock/toggle-visibility/target qua UXP — chỉ đọc được các field này.',
    inputSchema: {
      type: 'object',
      properties: {
        trackIndex: { type: 'number', description: 'Index track (0-based).' },
        trackType: { type: 'string', enum: ['video', 'audio'], description: 'Mặc định "video".' }
      },
      required: ['trackIndex']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('get_track_info', { trackIndex: args.trackIndex, trackType: args.trackType }, 10000);
    }
  },

  {
    name: 'list_sequence_tracks',
    description: 'Liệt kê toàn bộ video/audio track trong sequence đang active (tên, mute, số clip mỗi track).',
    inputSchema: { type: 'object', properties: {}, required: [] },
    execute(wsBridge) {
      return wsBridge.sendCommand('list_sequence_tracks', {}, 10000);
    }
  },

  {
    name: 'rename_track',
    description: 'Đổi tên 1 video/audio track trong sequence đang active.',
    inputSchema: {
      type: 'object',
      properties: {
        trackIndex: { type: 'number', description: 'Index track (0-based).' },
        trackType: { type: 'string', enum: ['video', 'audio'], description: 'Mặc định "video".' },
        newName: { type: 'string', description: 'Tên mới cho track.' }
      },
      required: ['trackIndex', 'newName']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('rename_track', { trackIndex: args.trackIndex, trackType: args.trackType, newName: args.newName }, 10000);
    }
  },

  {
    name: 'setup_audio_ducking',
    description: 'Thiết lập audio ducking: tự động giảm âm lượng nhạc nền khi có voice. Thêm keyframes vào music track để giảm dB tại các đoạn voice active.',
    inputSchema: {
      type: 'object',
      properties: {
        musicTrackIndex: {
          type: 'number',
          description: 'Index của track nhạc nền (0-based).'
        },
        voiceTrackIndex: {
          type: 'number',
          description: 'Index của track voice (0-based).'
        },
        duckDb: {
          type: 'number',
          description: 'Mức giảm âm lượng tính bằng dB khi voice active. Mặc định -12 dB.'
        }
      },
      required: ['musicTrackIndex', 'voiceTrackIndex']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('setup_audio_ducking', {
        musicTrackIndex: args.musicTrackIndex,
        voiceTrackIndex: args.voiceTrackIndex,
        duckDb: args.duckDb ?? -12
      }, 30000);
    }
  },

  // ==========================================================================
  // GROUP 6 — Transitions
  // ==========================================================================
  {
    name: 'list_available_transitions',
    description: 'Lấy danh sách transition có sẵn trong Premiere Pro từ effect database offline: video transitions, audio transitions, hoặc tất cả.',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: '"video" | "audio" | "all" (mặc định). Lọc theo loại transition.',
          enum: ['video', 'audio', 'all']
        }
      },
      required: []
    },
    async execute(wsBridge, args) {
      const { EFFECTS_DB } = await import('../data/premiere-effects.js');
      const typeFilter = args.type ?? 'all';

      // TransitionFactory.getVideoTransitionMatchNames() chỉ trả VIDEO transition (không có API
      // live cho audio transition — đã xác nhận qua nghiên cứu, AudioFilterFactory không có hàm
      // tương đương) — audio transitions LUÔN lấy từ database tĩnh. Video transition: merge qua
      // matchName với database tĩnh để có category đẹp khi trùng, giữ nguyên matchName thật để apply.
      const staticAudio = EFFECTS_DB.filter(e => e.isTransition && e.category.toLowerCase().includes('audio'));
      let videoSource = EFFECTS_DB.filter(e => e.isTransition && e.category.toLowerCase().includes('video'));
      if (wsBridge.isConnected()) {
        try {
          const live = await wsBridge.sendCommand('list_installed_transitions', {}, 15000);
          if (live?.transitions?.length) {
            const staticByMatchName = new Map(videoSource.map(e => [e.matchName.toLowerCase(), e]));
            videoSource = live.transitions.map(t => staticByMatchName.get(t.matchName.toLowerCase()) ?? t);
          }
        } catch { /* rơi về database tĩnh */ }
      }
      const source = [...videoSource, ...staticAudio];

      const transitions = source.filter(e => {
        if (!e.isTransition) return false;
        if (typeFilter === 'video') return e.category.toLowerCase().includes('video');
        if (typeFilter === 'audio') return e.category.toLowerCase().includes('audio');
        return true;
      });
      return { transitions, total: transitions.length };
    }
  },

  {
    name: 'add_transition',
    description: 'Thêm transition vào đầu, cuối, hoặc cả hai đầu của clip đang chọn. Mặc định dùng Cross Dissolve.',
    inputSchema: {
      type: 'object',
      properties: {
        position: {
          type: 'string',
          description: '"start" | "end" | "both" — vị trí thêm transition.',
          enum: ['start', 'end', 'both']
        },
        matchName: {
          type: 'string',
          description: 'FilterMatchName của transition. Mặc định "ADBE Cross Dissolve". Dùng list_available_transitions để xem các option khác.'
        },
        durationFrames: {
          type: 'number',
          description: 'Thời lượng transition tính bằng frame. Mặc định 15 frame.'
        }
      },
      required: ['position']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('add_transition', {
        position: args.position,
        matchName: args.matchName ?? 'ADBE Cross Dissolve',
        durationFrames: args.durationFrames ?? 15
      }, 20000);
    }
  },

  {
    name: 'batch_add_transitions',
    description: 'Thêm cùng một transition vào TẤT CẢ clip đang được chọn. Tiết kiệm thời gian khi cần transition đồng nhất.',
    inputSchema: {
      type: 'object',
      properties: {
        position: {
          type: 'string',
          description: '"start" | "end" | "both".',
          enum: ['start', 'end', 'both']
        },
        matchName: {
          type: 'string',
          description: 'FilterMatchName của transition. Mặc định "ADBE Cross Dissolve".'
        },
        durationFrames: {
          type: 'number',
          description: 'Thời lượng (frame). Mặc định 15.'
        }
      },
      required: ['position']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('batch_add_transitions', {
        position: args.position,
        matchName: args.matchName ?? 'ADBE Cross Dissolve',
        durationFrames: args.durationFrames ?? 15
      }, 60000);
    }
  },

  // ==========================================================================
  // GROUP 7 — Color Grading
  // ==========================================================================
  {
    name: 'apply_lumetri_preset',
    description: 'Áp dụng preset màu Lumetri Color lên clip đang chọn. Có thể truyền tên preset built-in (Kodak, Fuji, Cinema...) hoặc đường dẫn file .cube / .look.',
    inputSchema: {
      type: 'object',
      properties: {
        presetName: {
          type: 'string',
          description: 'Tên preset Lumetri built-in, ví dụ "Kodak 5218 Kodak 2383", "SL Big & Bright". Hoặc để trống nếu chỉ dùng inputCubePath.'
        },
        inputCubePath: {
          type: 'string',
          description: 'Đường dẫn tuyệt đối đến file .cube hoặc .look để import như LUT.'
        }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('apply_lumetri_preset', {
        presetName: args.presetName,
        inputCubePath: args.inputCubePath
      }, 20000);
    }
  },

  {
    name: 'set_clip_color_label',
    description: 'Đặt màu label cho clip trong timeline/project panel, dùng để phân loại. Ví dụ: video = iris, music = mango, voice = rose.',
    inputSchema: {
      type: 'object',
      properties: {
        color: {
          type: 'string',
          description: 'Màu label: "violet" | "iris" | "caribbean" | "lavender" | "cerulean" | "forest" | "rose" | "mango" | "none".',
          enum: ['violet', 'iris', 'caribbean', 'lavender', 'cerulean', 'forest', 'rose', 'mango', 'none']
        }
      },
      required: ['color']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('set_clip_color_label', { color: args.color }, 10000);
    }
  },

  {
    name: 'adjust_color_values',
    description: 'Chỉnh nhanh các thông số màu cơ bản của clip qua Lumetri Color: exposure, contrast, saturation, temperature. Truyền chỉ các thông số cần đổi, bỏ qua phần còn lại.',
    inputSchema: {
      type: 'object',
      properties: {
        exposure: { type: 'number', description: 'Exposure (-5 đến +5). 0 = giữ nguyên.' },
        contrast: { type: 'number', description: 'Contrast (-100 đến +100).' },
        saturation: { type: 'number', description: 'Saturation (0 = grayscale, 100 = bình thường, 200 = siêu bão hòa).' },
        temperature: { type: 'number', description: 'Color temperature (-100 cool/xanh đến +100 warm/vàng).' }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('adjust_color_values', {
        exposure: args.exposure,
        contrast: args.contrast,
        saturation: args.saturation,
        temperature: args.temperature
      }, 20000);
    }
  },

  // ==========================================================================
  // GROUP 8 — Captions & Subtitles
  // ==========================================================================
  {
    name: 'create_caption_track',
    description: 'Tạo caption track mới trong sequence đang active. Hỗ trợ format Open Captions, CEA-708, subtitle.',
    inputSchema: {
      type: 'object',
      properties: {
        format: {
          type: 'string',
          description: '"subtitle" (mặc định, Open Captions) | "CEA-708" | "SRT".',
          enum: ['subtitle', 'CEA-708', 'SRT']
        }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('create_caption_track', { format: args.format ?? 'subtitle' }, 15000);
    }
  },

  {
    name: 'import_srt',
    description: 'Import file phụ đề .srt vào Premiere và thêm vào caption track. Premiere 2024+ có thể tự chuyển đổi SRT thành Open Captions.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Đường dẫn tuyệt đối đến file .srt.' },
        trackIndex: { type: 'number', description: 'Index caption track đích. Bỏ trống = tạo track mới hoặc dùng track đầu tiên.' }
      },
      required: ['path']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('import_srt', { path: args.path, trackIndex: args.trackIndex }, 20000);
    }
  },

  {
    name: 'read_sequence_captions',
    description: 'Đọc nội dung các caption đang có trên sequence: thời điểm bắt đầu/kết thúc, text. Dùng để review subtitle trước khi export.',
    inputSchema: {
      type: 'object',
      properties: {
        trackIndex: { type: 'number', description: 'Index caption track (0-based). Bỏ trống = đọc track caption đầu tiên.' }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('read_sequence_captions', { trackIndex: args.trackIndex }, 15000);
    }
  },

  // ==========================================================================
  // GROUP 9 — Clip Speed & Playback
  // ==========================================================================
  {
    name: 'set_clip_speed',
    description: 'Thay đổi tốc độ phát của clip đang chọn. 50 = slow motion 50%, 200 = tăng tốc 2x. Duration clip sẽ thay đổi theo.',
    inputSchema: {
      type: 'object',
      properties: {
        speedPercent: {
          type: 'number',
          description: 'Tốc độ phần trăm (1-800). 100 = bình thường, 50 = chậm 2x, 200 = nhanh 2x.',
          minimum: 1,
          maximum: 800
        }
      },
      required: ['speedPercent']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('set_clip_speed', { speedPercent: args.speedPercent }, 15000);
    }
  },

  {
    name: 'reverse_clip',
    description: 'Đảo ngược hướng phát (reverse) clip đang chọn. Clip sẽ chạy từ cuối về đầu.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    execute(wsBridge) {
      return wsBridge.sendCommand('reverse_clip', {}, 15000);
    }
  },

  {
    name: 'freeze_frame',
    description: 'Đóng băng frame tại một thời điểm chỉ định trên clip đang chọn. Phần còn lại của clip sẽ hiển thị frame đó tĩnh. Yêu cầu QE DOM.',
    inputSchema: {
      type: 'object',
      properties: {
        atSeconds: { type: 'number', description: 'Thời điểm frame cần đóng băng (giây theo sequence time). Bỏ trống = frame tại CTI hiện tại.' }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('freeze_frame', { atSeconds: args.atSeconds }, 15000);
    }
  },

  // ==========================================================================
  // GROUP 10 — Media & Bin Management
  // ==========================================================================
  {
    name: 'create_bin',
    description: 'Tạo bin (thư mục) mới trong Project panel. Có thể tạo trong root hoặc trong bin cha đã có.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Tên bin mới.' },
        parentBin: { type: 'string', description: 'Tên bin cha. Bỏ trống = tạo trong root project.' }
      },
      required: ['name']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('create_bin', { name: args.name, parentBin: args.parentBin }, 15000);
    }
  },

  {
    name: 'move_item_to_bin',
    description: 'Di chuyển một item trong Project panel sang bin khác theo tên.',
    inputSchema: {
      type: 'object',
      properties: {
        clipName: { type: 'string', description: 'Tên clip/item trong Project panel cần di chuyển.' },
        targetBin: { type: 'string', description: 'Tên bin đích.' }
      },
      required: ['clipName', 'targetBin']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('move_item_to_bin', { clipName: args.clipName, targetBin: args.targetBin }, 15000);
    }
  },

  {
    name: 'replace_clip_media',
    description: 'Thay thế file media của clip đang chọn bằng file mới, giữ nguyên vị trí trên timeline và tất cả effect đã áp.',
    inputSchema: {
      type: 'object',
      properties: {
        newFilePath: { type: 'string', description: 'Đường dẫn tuyệt đối đến file media mới.' }
      },
      required: ['newFilePath']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('replace_clip_media', { newFilePath: args.newFilePath }, 20000);
    }
  },

  {
    name: 'relink_offline_media',
    description: 'Tự động relink (khớp lại đường dẫn) các clip offline trong project. Tìm file trong thư mục chỉ định.',
    inputSchema: {
      type: 'object',
      properties: {
        searchFolder: { type: 'string', description: 'Đường dẫn thư mục để tìm file. Bỏ trống = Premiere tự tìm theo vị trí gần đây.' }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('relink_offline_media', { searchFolder: args.searchFolder }, 30000);
    }
  },

  // ==========================================================================
  // GROUP 11 — Selection & Multi-clip Ops
  // ==========================================================================
  {
    name: 'select_clips_in_range',
    description: 'Chọn tất cả clip trên timeline nằm trong khoảng thời gian chỉ định. Có thể lọc theo loại track (video/audio/all).',
    inputSchema: {
      type: 'object',
      properties: {
        startSeconds: { type: 'number', description: 'Bắt đầu khoảng thời gian (giây).' },
        endSeconds: { type: 'number', description: 'Kết thúc khoảng thời gian (giây).' },
        trackType: {
          type: 'string',
          description: '"video" | "audio" | "all" (mặc định "all").',
          enum: ['video', 'audio', 'all']
        }
      },
      required: ['startSeconds', 'endSeconds']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('select_clips_in_range', {
        startSeconds: args.startSeconds,
        endSeconds: args.endSeconds,
        trackType: args.trackType ?? 'all'
      }, 15000);
    }
  },

  {
    name: 'select_all_clips',
    description: 'Chọn tất cả clip trên timeline. Có thể lọc chỉ chọn video clips hoặc audio clips.',
    inputSchema: {
      type: 'object',
      properties: {
        trackType: {
          type: 'string',
          description: '"video" | "audio" | "all" (mặc định "all").',
          enum: ['video', 'audio', 'all']
        }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('select_all_clips', { trackType: args.trackType ?? 'all' }, 15000);
    }
  },

  {
    name: 'deselect_all_clips',
    description: 'Bỏ chọn tất cả clip trên timeline.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    execute(wsBridge) {
      return wsBridge.sendCommand('deselect_all_clips', {}, 10000);
    }
  },

  // ==========================================================================
  // GROUP 12 — Scene Detection
  // ==========================================================================
  {
    name: 'detect_scene_edits',
    description: 'Tự động phát hiện điểm chuyển cảnh trong clip video đang chọn (Scene Edit Detection). Có thể tự động thêm marker tại mỗi điểm chuyển cảnh. Yêu cầu Premiere 2022+.',
    inputSchema: {
      type: 'object',
      properties: {
        sensitivity: {
          type: 'number',
          description: 'Độ nhạy phát hiện (0-100). Cao hơn = phát hiện nhiều điểm hơn nhưng có thể nhiễu. Mặc định 50.',
          minimum: 0,
          maximum: 100
        },
        createMarkers: {
          type: 'boolean',
          description: 'true (mặc định) = tạo marker tại mỗi điểm chuyển cảnh, false = chỉ trả danh sách.'
        }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('detect_scene_edits', {
        sensitivity: args.sensitivity ?? 50,
        createMarkers: args.createMarkers !== false
      }, 120000);
    }
  },

  // ==========================================================================
  // GROUP 13 — Metadata
  // ==========================================================================
  {
    name: 'get_clip_metadata',
    description: 'Lấy metadata XMP của clip đang chọn: description, director, scene, keyword, v.v. Chỉ đọc.',
    inputSchema: {
      type: 'object',
      properties: {
        fields: {
          type: 'array',
          description: 'Danh sách field cần đọc, ví dụ ["description", "director", "scene"]. Bỏ trống = trả tất cả field có giá trị.',
          items: { type: 'string' }
        }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('get_clip_metadata', { fields: args.fields }, 15000);
    }
  },

  {
    name: 'set_clip_metadata',
    description: 'Ghi metadata XMP lên clip đang chọn. Hỗ trợ các field như description, director, scene, keyword, comment.',
    inputSchema: {
      type: 'object',
      properties: {
        metadata: {
          type: 'object',
          description: 'Object { field: value } cần ghi, ví dụ { "description": "Cảnh 1", "director": "Nguyễn Văn A" }.'
        }
      },
      required: ['metadata']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('set_clip_metadata', { metadata: args.metadata }, 15000);
    }
  },

  // ==========================================================================
  // GROUP 14 — Motion Graphics & MOGRT
  // ==========================================================================
  {
    name: 'import_mogrt',
    description: 'Import file Motion Graphics Template (.mogrt) vào sequence tại thời điểm chỉ định. MOGRT sẽ được thêm vào video track mới.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Đường dẫn tuyệt đối đến file .mogrt.' },
        insertAtSeconds: { type: 'number', description: 'Thời điểm insert (giây). Bỏ trống = chèn tại CTI hiện tại.' }
      },
      required: ['path']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('import_mogrt', { path: args.path, insertAtSeconds: args.insertAtSeconds }, 20000);
    }
  },

  {
    name: 'add_text_overlay',
    description: 'Thêm text overlay (Essential Graphics) vào sequence tại khoảng thời gian chỉ định. Chọn style: title (to, nổi bật), lower-third (chú thích bên dưới), caption (phụ đề nhỏ).',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Nội dung text cần hiển thị.' },
        startSeconds: { type: 'number', description: 'Thời điểm bắt đầu hiển thị (giây).' },
        endSeconds: { type: 'number', description: 'Thời điểm kết thúc (giây).' },
        style: {
          type: 'string',
          description: '"title" | "lower-third" | "caption". Mặc định "lower-third".',
          enum: ['title', 'lower-third', 'caption']
        }
      },
      required: ['text', 'startSeconds', 'endSeconds']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('add_text_overlay', {
        text: args.text,
        startSeconds: args.startSeconds,
        endSeconds: args.endSeconds,
        style: args.style ?? 'lower-third'
      }, 20000);
    }
  },

  // ==========================================================================
  // GROUP 15 — Export Expanded
  // ==========================================================================
  {
    name: 'capture_frame',
    description: 'Chụp frame hiện tại của sequence và lưu ra file ảnh. Hỗ trợ PNG và JPEG.',
    inputSchema: {
      type: 'object',
      properties: {
        timeSeconds: { type: 'number', description: 'Thời điểm frame cần chụp (giây). Bỏ trống = CTI hiện tại.' },
        outputPath: { type: 'string', description: 'Đường dẫn lưu ảnh (bao gồm tên file + đuôi .png hoặc .jpg). Bỏ trống = tự sinh tên trong thư mục Desktop.' },
        format: {
          type: 'string',
          description: '"png" (mặc định) | "jpg".',
          enum: ['png', 'jpg']
        }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('capture_frame', {
        timeSeconds: args.timeSeconds,
        outputPath: args.outputPath,
        format: args.format ?? 'png'
      }, 30000);
    }
  },

  {
    name: 'export_as_xml',
    description: 'Export sequence/project ra định dạng XML để trao đổi với phần mềm khác: FCP 7 XML, FCPXML (DaVinci), AAF.',
    inputSchema: {
      type: 'object',
      properties: {
        format: {
          type: 'string',
          description: '"fcp7" (Final Cut Pro 7) | "fcpxml" (Final Cut Pro X / DaVinci) | "aaf" (Pro Tools).',
          enum: ['fcp7', 'fcpxml', 'aaf']
        },
        outputPath: { type: 'string', description: 'Đường dẫn lưu file XML.' }
      },
      required: ['format', 'outputPath']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('export_as_xml', { format: args.format, outputPath: args.outputPath }, 60000);
    }
  },

  {
    name: 'export_to_media_encoder',
    description: 'Đưa sequence vào hàng đợi Adobe Media Encoder để encode. Có thể chỉ định preset và đường dẫn output.',
    inputSchema: {
      type: 'object',
      properties: {
        presetName: { type: 'string', description: 'Tên preset AME, ví dụ "H.264 1080p", "YouTube 1080p". Bỏ trống = dùng preset mặc định.' },
        outputPath: { type: 'string', description: 'Đường dẫn file output. Bỏ trống = Premiere tự chọn.' }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('export_to_media_encoder', {
        presetName: args.presetName,
        outputPath: args.outputPath
      }, 30000);
    }
  },

  // ==========================================================================
  // GROUP 16 — AI Features
  // ==========================================================================
  {
    name: 'transcribe_clip',
    description: 'Chuyển đổi giọng nói thành văn bản từ clip audio/video đang chọn. Ưu tiên dùng Premiere Speech-to-Text built-in (2023+). Nếu có OPENAI_API_KEY thì dùng Whisper API cho kết quả chính xác hơn.',
    inputSchema: {
      type: 'object',
      properties: {
        language: {
          type: 'string',
          description: 'Mã ngôn ngữ ISO 639-1, ví dụ "vi" (tiếng Việt), "en" (English), "auto" (tự detect). Mặc định "auto".'
        }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('transcribe_clip', { language: args.language ?? 'auto' }, 300000);
    }
  },

  {
    name: 'auto_caption_from_speech',
    description: 'Tự động tạo caption từ giọng nói clip đang chọn. Workflow: transcribe_clip → create_caption_track → populate. Kết quả là caption track sẵn sàng chỉnh sửa trong Premiere.',
    inputSchema: {
      type: 'object',
      properties: {
        language: {
          type: 'string',
          description: 'Mã ngôn ngữ ISO 639-1. Mặc định "auto".'
        },
        style: {
          type: 'string',
          description: '"subtitle" (mặc định, Open Captions) | "captions" (CEA-708).',
          enum: ['subtitle', 'captions']
        }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('auto_caption_from_speech', {
        language: args.language ?? 'auto',
        style: args.style ?? 'subtitle'
      }, 360000);
    }
  },

  // ==========================================================================
  // GROUP 17 — Timeline Placement & Sequence Management (2026-09-09)
  // API xác nhận qua @adobe/premierepro type declarations + sample repo chính
  // thức Adobe, CHƯA test trên Premiere thật — xem premiere-uxp-scripting-api-
  // capabilities.md trong memory. add_track/remove_track KHÔNG có tool riêng vì
  // Adobe xác nhận chưa có API — insert_clip/overwrite_clip sẽ báo lỗi rõ ràng
  // nếu videoTrackIndex/audioTrackIndex vượt quá số track hiện có thay vì âm
  // thầm thất bại.
  // ==========================================================================
  {
    name: 'insert_clip',
    description: 'Đặt 1 item từ Project panel (video, ảnh PNG, v.v. — tìm theo tên, kể cả trong bin con) lên timeline tại thời điểm chỉ định, kiểu INSERT (đẩy các clip sau đó sang phải). Với ảnh tĩnh, truyền durationSeconds để set thời lượng hiển thị (mặc định theo still-image duration preference của Premiere). Báo lỗi rõ nếu videoTrackIndex/audioTrackIndex vượt quá số track hiện có (chưa có API script tạo track mới).',
    inputSchema: {
      type: 'object',
      properties: {
        itemName: { type: 'string', description: 'Tên item trong Project panel cần đặt lên timeline.' },
        startSeconds: { type: 'number', description: 'Thời điểm đặt clip, tính theo sequence time (giây từ đầu sequence).' },
        videoTrackIndex: { type: 'number', description: 'Chỉ số video track đích (0 = V1). Mặc định 0.' },
        audioTrackIndex: { type: 'number', description: 'Chỉ số audio track đích (0 = A1). Mặc định 0.' },
        durationSeconds: { type: 'number', description: 'Thời lượng hiển thị mong muốn (giây) — chủ yếu dùng cho ảnh tĩnh không có duration gốc.' }
      },
      required: ['itemName', 'startSeconds']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('insert_clip', args, 30000);
    }
  },

  {
    name: 'overwrite_clip',
    description: 'Giống insert_clip nhưng kiểu OVERWRITE (ghi đè lên clip đang có tại vị trí đó thay vì đẩy sang phải).',
    inputSchema: {
      type: 'object',
      properties: {
        itemName: { type: 'string', description: 'Tên item trong Project panel cần đặt lên timeline.' },
        startSeconds: { type: 'number', description: 'Thời điểm đặt clip, tính theo sequence time.' },
        videoTrackIndex: { type: 'number', description: 'Chỉ số video track đích (0 = V1). Mặc định 0.' },
        audioTrackIndex: { type: 'number', description: 'Chỉ số audio track đích (0 = A1). Mặc định 0.' },
        durationSeconds: { type: 'number', description: 'Thời lượng hiển thị mong muốn (giây) — chủ yếu dùng cho ảnh tĩnh.' }
      },
      required: ['itemName', 'startSeconds']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('overwrite_clip', args, 30000);
    }
  },

  {
    name: 'batch_place_clips',
    description: 'Đặt nhiều clip (ảnh/video) lên timeline trong 1 lệnh MCP duy nhất — thay vì gọi insert_clip/overwrite_clip lặp lại từng cái. Mỗi placement độc lập, verify vị trí riêng; 1 cái lỗi không chặn các cái còn lại. Trả report placed/failed theo index.',
    inputSchema: {
      type: 'object',
      properties: {
        placements: {
          type: 'array',
          description: 'Danh sách clip cần đặt.',
          items: {
            type: 'object',
            properties: {
              itemName: { type: 'string', description: 'Tên item trong Project panel.' },
              startSeconds: { type: 'number', description: 'Vị trí đặt trên timeline (giây).' },
              durationSeconds: { type: 'number', description: 'Thời lượng hiển thị (giây) — chủ yếu cho ảnh tĩnh.' },
              videoTrackIndex: { type: 'number', description: 'Video track đích (0 = V1). Mặc định 0.' },
              audioTrackIndex: { type: 'number', description: 'Audio track đích. Mặc định 0.' },
              mode: { type: 'string', enum: ['insert', 'overwrite'], description: 'Mặc định "overwrite".' }
            },
            required: ['itemName', 'startSeconds']
          }
        }
      },
      required: ['placements']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('batch_place_clips', args, 300000);
    }
  },

  {
    name: 'duplicate_clip',
    description: 'Nhân bản clip đang chọn trên timeline, đặt bản sao lệch đi offsetSeconds về thời gian (và tuỳ chọn lệch track). Verify bằng cách đếm tổng track item trước/sau, không xác định chính xác track item mới bằng identity.',
    inputSchema: {
      type: 'object',
      properties: {
        offsetSeconds: { type: 'number', description: 'Độ lệch thời gian của bản sao so với clip gốc (giây). Mặc định 1.' },
        videoTrackOffset: { type: 'number', description: 'Độ lệch video track so với track gốc. Mặc định 0 (cùng track).' },
        audioTrackOffset: { type: 'number', description: 'Độ lệch audio track so với track gốc. Mặc định 0.' },
        alignToVideo: { type: 'boolean', description: 'Căn theo video khi có cả audio+video linked. Mặc định true.' }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('duplicate_clip', args, 30000);
    }
  },

  {
    name: 'create_sequence',
    description: 'Tạo sequence mới trong project đang mở. Mặc định (timebase=60) tạo sequence trắng rồi set frame rate thật + verify read-back qua API (chỉ khả dụng Premiere Pro 26.2+ — trên bản cũ hơn sequence vẫn được tạo nhưng timebaseApplied sẽ báo false kèm lý do, không set được). Có thể tạo từ item đang chọn trong Project panel (fromSelectedMedia=true), khi đó bỏ qua timebase/frameWidth/frameHeight.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Tên sequence mới.' },
        fromSelectedMedia: { type: 'boolean', description: 'true = tạo sequence từ (các) item đang chọn trong Project panel (bỏ qua timebase/frame size). Mặc định false.' },
        timebase: { type: 'number', description: 'Frame rate (fps) mong muốn, vd 23.976, 24, 25, 29.97, 30, 50, 59.94, 60. Mặc định 60. Chỉ có tác dụng trên Premiere Pro 26.2+ — kết quả trả về báo rõ timebaseApplied true/false (có verify read-back thật) + actualFps.' },
        frameWidth: { type: 'number', description: 'Chiều rộng khung hình (px), vd 1920 hoặc 1080. Cần truyền kèm frameHeight.' },
        frameHeight: { type: 'number', description: 'Chiều cao khung hình (px), vd 1080 hoặc 1920. Cần truyền kèm frameWidth.' }
      },
      required: ['name']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('create_sequence', args, 30000);
    }
  },

  {
    name: 'delete_sequence',
    description: 'Xoá 1 sequence khỏi project theo tên. Có verify read-back (kiểm tra sequence không còn trong danh sách sau khi xoá). Không thể hoàn tác qua MCP — cân nhắc trước khi gọi.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Tên sequence cần xoá.' }
      },
      required: ['name']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('delete_sequence', args, 15000);
    }
  },

  {
    name: 'insert_mogrt_caption',
    description: 'Chèn 1 file .mogrt lên timeline tại đúng vị trí/thời lượng chỉ định + set text (component AE.ADBE Text, param "Source Text"), có verify read-back thật (vị trí + text). Dùng cho 1 caption đơn lẻ — với nhiều caption từ file SRT, dùng srt_to_mogrt_captions (1 lệnh xử lý cả file, hiệu quả hơn nhiều so với gọi tool này lặp lại).',
    inputSchema: {
      type: 'object',
      properties: {
        mogrtPath: { type: 'string', description: 'Đường dẫn tuyệt đối tới file .mogrt. Premiere có sẵn vài mẫu tại "<thư mục cài Premiere>\\Essential Graphics\\" (vd "Basic Title.mogrt", hoặc thư mục con "Captions and Subtitles\\").' },
        startSeconds: { type: 'number', description: 'Vị trí đặt trên timeline (giây).' },
        durationSeconds: { type: 'number', description: 'Thời lượng hiển thị (giây). Bỏ trống = giữ duration mặc định của mogrt.' },
        text: { type: 'string', description: 'Nội dung text sẽ set vào mogrt. Bỏ trống = giữ text mặc định của template.' },
        videoTrackIndex: { type: 'number', description: 'Video track đích (0 = V1). Mặc định 2 — nên dùng track riêng, không trùng video/ảnh nền.' },
        textParamName: { type: 'string', description: 'Tên hiển thị của param text trong Effect Controls. Mặc định "Source Text" (đúng cho hầu hết mogrt chuẩn Adobe).' }
      },
      required: ['mogrtPath', 'startSeconds']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('insert_mogrt_caption', args, 20000);
    }
  },

  {
    name: 'srt_to_mogrt_captions',
    description: 'Đọc 1 file .srt, parse thành các cue {start,end,text}, rồi chèn MỖI cue thành 1 clip MOGRT lên timeline đúng vị trí/thời lượng + set text — TẤT CẢ trong 1 lệnh MCP duy nhất (xử lý tuần tự bên trong plugin, không phải gọi lặp lại từng cue từ Claude). Trả về report: tổng cue, số tạo thành công, số verify đầy đủ (vị trí + text đều đúng), danh sách cue lỗi kèm lý do — không báo thành công giả nếu có cue lỗi.',
    inputSchema: {
      type: 'object',
      properties: {
        srtPath: { type: 'string', description: 'Đường dẫn tuyệt đối tới file .srt.' },
        mogrtPath: { type: 'string', description: 'Đường dẫn tuyệt đối tới file .mogrt dùng làm template cho mọi cue.' },
        videoTrackIndex: { type: 'number', description: 'Video track đích. Mặc định 2 — nên dùng track riêng cho caption.' },
        textParamName: { type: 'string', description: 'Tên param text trong mogrt. Mặc định "Source Text".' },
        startOffsetSeconds: { type: 'number', description: 'Cộng thêm vào mọi timestamp trong SRT (giây). Mặc định 0.' },
        maxCues: { type: 'number', description: 'Giới hạn số cue xử lý (để test nhanh trên 1 phần file trước khi chạy full). Bỏ trống = xử lý hết.' }
      },
      required: ['srtPath', 'mogrtPath']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('srt_to_mogrt_captions', args, 300000);
    }
  },

  {
    name: 'get_sequence_settings',
    description: 'Đọc settings thật của 1 sequence qua API (chỉ khả dụng Premiere Pro 26.2+): fps thật, ticksPerFrame, resolution. Dùng để verify sau khi tạo/đổi frame rate, hoặc kiểm tra 1 sequence bất kỳ trong project trước khi tin tưởng nó đúng 60fps.',
    inputSchema: {
      type: 'object',
      properties: {
        sequenceName: { type: 'string', description: 'Tên sequence cần đọc. Bỏ trống = sequence đang active.' }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('get_sequence_settings', args, 15000);
    }
  },

  {
    name: 'set_sequence_frame_rate',
    description: 'Đổi frame rate thật của 1 sequence, có verify read-back (đọc lại settings sau khi set, so before/after — nếu Premiere không đổi thật sẽ báo lỗi no-op thay vì thành công giả). Chỉ khả dụng Premiere Pro 26.2+. Hỗ trợ rational fps chuẩn (23.976=24000/1001, 29.97=30000/1001, 59.94=60000/1001) — không dùng so sánh float trực tiếp.',
    inputSchema: {
      type: 'object',
      properties: {
        fps: { type: 'number', description: 'Frame rate mong muốn: 23.976, 24, 25, 29.97, 30, 50, 59.94, hoặc 60.' },
        sequenceName: { type: 'string', description: 'Tên sequence cần đổi. Bỏ trống = sequence đang active.' }
      },
      required: ['fps']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('set_sequence_frame_rate', args, 15000);
    }
  },

  {
    name: 'duplicate_sequence',
    description: 'Nhân bản 1 sequence (mặc định là sequence đang active, hoặc chỉ định sourceSequenceName). Dùng Sequence.createCloneAction() — chưa test trên Premiere thật.',
    inputSchema: {
      type: 'object',
      properties: {
        sourceSequenceName: { type: 'string', description: 'Tên sequence nguồn cần duplicate. Bỏ trống = dùng sequence đang active.' }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('duplicate_sequence', args, 30000);
    }
  },

  {
    name: 'set_active_sequence',
    description: 'Chuyển sequence đang active của project sang sequence chỉ định theo tên.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Tên sequence cần chuyển sang active.' }
      },
      required: ['name']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('set_active_sequence', args, 15000);
    }
  },

  // ==========================================================================
  // GROUP 17b — Generic Markers (2026-09-09) — khác marker nhịp beat, tag riêng
  // bằng "[MCP marker]" trong comment để không đụng vào marker Beat Shake tạo ra.
  // ==========================================================================
  {
    name: 'add_marker',
    description: 'Thêm 1 marker thường (không phải marker nhịp) lên sequence hoặc clip đang chọn, có tên/màu/comment/duration tuỳ chọn.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Tên marker.' },
        timeSeconds: { type: 'number', description: 'Thời điểm đặt marker (giây).' },
        durationSeconds: { type: 'number', description: 'Thời lượng marker (giây). Mặc định 0 (marker điểm).' },
        comment: { type: 'string', description: 'Comment cho marker (tuỳ chọn).' },
        colorIndex: { type: 'number', description: 'Chỉ số màu marker (tuỳ chọn, theo bảng màu Premiere).' },
        scope: { type: 'string', description: '"sequence" (mặc định) hoặc "clip" (clip đang chọn trên timeline).', enum: ['sequence', 'clip'] }
      },
      required: ['name', 'timeSeconds']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('add_marker', args, 15000);
    }
  },

  {
    name: 'remove_marker',
    description: 'Xoá marker thường khớp theo tên và/hoặc thời điểm, trên sequence hoặc clip đang chọn. Không đụng vào marker nhịp beat.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Tên marker cần xoá (tuỳ chọn nếu có timeSeconds).' },
        timeSeconds: { type: 'number', description: 'Thời điểm marker cần xoá, dung sai 0.05s (tuỳ chọn nếu có name).' },
        scope: { type: 'string', description: '"sequence" (mặc định) hoặc "clip".', enum: ['sequence', 'clip'] }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('remove_marker', args, 15000);
    }
  },

  {
    name: 'update_marker',
    description: 'Sửa marker thường đã có (tìm theo tên hoặc thời điểm): đổi tên, comment, duration, hoặc màu.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Tên marker hiện tại cần tìm (tuỳ chọn nếu có timeSeconds).' },
        timeSeconds: { type: 'number', description: 'Thời điểm marker cần tìm (tuỳ chọn nếu có name).' },
        newName: { type: 'string', description: 'Tên mới.' },
        newComment: { type: 'string', description: 'Comment mới.' },
        newDurationSeconds: { type: 'number', description: 'Duration mới (giây).' },
        newColorIndex: { type: 'number', description: 'Màu mới (chỉ số).' },
        scope: { type: 'string', description: '"sequence" (mặc định) hoặc "clip".', enum: ['sequence', 'clip'] }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('update_marker', args, 15000);
    }
  },

  // ==========================================================================
  // GROUP 18 — Subtitle sync workaround (2026-09-09) — vì không có API script tạo
  // text overlay (xem addTextOverlay), đây là đường vòng thật sự chạy được: sinh
  // file .srt đúng time range/text rồi import vào Project — vẫn cần 1 thao tác
  // tay cuối (kéo vào caption track).
  // ==========================================================================
  {
    name: 'generate_and_import_srt',
    description: 'Sinh file phụ đề .srt từ danh sách đoạn {startSeconds, endSeconds, text} rồi import vào Project panel. KHÔNG tự đặt lên caption track — cần kéo tay 1 lần vào caption track sau khi import (dùng create_caption_track để tạo track trước nếu cần). Đây là đường vòng thật cho việc "thêm sub text theo lời thoại" vì Premiere chưa có API script tạo text overlay trực tiếp.',
    inputSchema: {
      type: 'object',
      properties: {
        segments: {
          type: 'array',
          description: 'Danh sách đoạn phụ đề.',
          items: {
            type: 'object',
            properties: {
              startSeconds: { type: 'number' },
              endSeconds: { type: 'number' },
              text: { type: 'string' }
            },
            required: ['startSeconds', 'endSeconds', 'text']
          }
        },
        outputPath: { type: 'string', description: 'Đường dẫn file .srt sẽ ghi ra, ví dụ "D:\\\\project\\\\subs.srt".' },
        binName: { type: 'string', description: 'Bin đích trong Project panel (tuỳ chọn).' }
      },
      required: ['segments', 'outputPath']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('generate_and_import_srt', args, 30000);
    }
  },

  // ==========================================================================
  // GROUP 19 — THỬ NGHIỆM: Transcript-JSON (2026-09-09) — CHƯA xác nhận hoạt
  // động trên Premiere thật, cần test trực tiếp trước khi tin cậy. Xem cảnh báo
  // trong warning field của kết quả trả về.
  // ==========================================================================
  {
    name: 'import_transcript_json',
    description: 'THỬ NGHIỆM, CHƯA XÁC NHẬN: gắn transcript dạng JSON (text + time range tuỳ ý, không cần từ audio thật) vào clip đang chọn qua Transcript.importFromJSON — hướng đi khả dĩ để có "sub text theo lời thoại" mà không cần Essential Graphics. Chưa rõ bước convert transcript→caption có script được không. Cần mở Premiere kiểm tra Text panel sau khi chạy.',
    inputSchema: {
      type: 'object',
      properties: {
        segments: {
          type: 'array',
          description: 'Danh sách đoạn transcript.',
          items: {
            type: 'object',
            properties: {
              startSeconds: { type: 'number' },
              endSeconds: { type: 'number' },
              text: { type: 'string' }
            },
            required: ['startSeconds', 'endSeconds', 'text']
          }
        }
      },
      required: ['segments']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('import_transcript_json', args, 30000);
    }
  },

  // ==========================================================================
  // GROUP 20 — Motion/Transform (2026-09-14): dựng trên component "Motion"/"Opacity"
  // có sẵn mặc định trên mọi clip. Position/Anchor Point dùng toạ độ pixel tuyệt đối
  // (không phải % chuẩn hoá 0-1).
  // ==========================================================================
  {
    name: 'set_clip_position',
    description: 'Đặt vị trí (Position) của clip đang chọn qua effect Motion. Toạ độ pixel tuyệt đối (không phải % chuẩn hoá), gốc (0,0) ở góc trên-trái khung hình.',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'Toạ độ X (pixel).' },
        y: { type: 'number', description: 'Toạ độ Y (pixel).' }
      },
      required: ['x', 'y']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('set_clip_position', { x: args.x, y: args.y }, 15000);
    }
  },

  {
    name: 'set_clip_anchor_point',
    description: 'Đặt điểm neo (Anchor Point) của clip đang chọn qua effect Motion — điểm mốc để Scale/Rotation xoay quanh. Toạ độ pixel tuyệt đối, tương đối so với clip nguồn.',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'Toạ độ X (pixel).' },
        y: { type: 'number', description: 'Toạ độ Y (pixel).' }
      },
      required: ['x', 'y']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('set_clip_anchor_point', { x: args.x, y: args.y }, 15000);
    }
  },

  {
    name: 'set_clip_scale',
    description: 'Đặt tỷ lệ phóng to/thu nhỏ (Scale) của clip đang chọn qua effect Motion. 100 = kích thước gốc.',
    inputSchema: {
      type: 'object',
      properties: {
        scalePercent: { type: 'number', description: 'Tỷ lệ phần trăm, vd 100 = gốc, 50 = nửa, 200 = gấp đôi.' }
      },
      required: ['scalePercent']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('set_clip_scale', { scalePercent: args.scalePercent }, 15000);
    }
  },

  {
    name: 'set_clip_rotation',
    description: 'Đặt góc xoay (Rotation) của clip đang chọn qua effect Motion.',
    inputSchema: {
      type: 'object',
      properties: {
        degrees: { type: 'number', description: 'Góc xoay tính bằng độ. 0 = không xoay.' }
      },
      required: ['degrees']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('set_clip_rotation', { degrees: args.degrees }, 15000);
    }
  },

  {
    name: 'set_clip_opacity',
    description: 'Đặt độ mờ đục (Opacity) của clip đang chọn.',
    inputSchema: {
      type: 'object',
      properties: {
        percent: { type: 'number', description: 'Phần trăm độ mờ đục (0-100). 100 = hiện rõ hoàn toàn, 0 = trong suốt.' }
      },
      required: ['percent']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('set_clip_opacity', { percent: args.percent }, 15000);
    }
  },

  {
    name: 'get_clip_transform',
    description: 'Đọc toàn bộ thông số transform hiện tại của clip đang chọn: position, anchorPoint, scale, rotation, opacity. Chỉ đọc.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    execute(wsBridge) {
      return wsBridge.sendCommand('get_clip_transform', {}, 15000);
    }
  },

  // ==========================================================================
  // GROUP 21 — Xoá theo lựa chọn/khoảng thời gian (2026-09-14)
  // ==========================================================================
  {
    name: 'remove_selected_clips',
    description: 'Xoá TOÀN BỘ clip đang được chọn trên timeline trong 1 lệnh (khác delete_clip chỉ xoá 1 clip).',
    inputSchema: {
      type: 'object',
      properties: {
        ripple: { type: 'boolean', description: 'true = ripple delete (đóng khoảng trống), false (mặc định) = giữ nguyên khoảng trống.' }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('remove_selected_clips', { ripple: args.ripple }, 20000);
    }
  },

  {
    name: 'extract_selection',
    description: 'Xoá toàn bộ clip nằm trong khoảng thời gian chỉ định VÀ đóng khoảng trống (ripple) — tương đương "Extract" trong Premiere.',
    inputSchema: {
      type: 'object',
      properties: {
        startSeconds: { type: 'number', description: 'Bắt đầu khoảng cần xoá (giây).' },
        endSeconds: { type: 'number', description: 'Kết thúc khoảng cần xoá (giây).' },
        trackType: { type: 'string', enum: ['video', 'audio', 'all'], description: 'Mặc định "all".' }
      },
      required: ['startSeconds', 'endSeconds']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('extract_selection', { startSeconds: args.startSeconds, endSeconds: args.endSeconds, trackType: args.trackType }, 20000);
    }
  },

  {
    name: 'lift_selection',
    description: 'Xoá toàn bộ clip nằm trong khoảng thời gian chỉ định nhưng GIỮ NGUYÊN khoảng trống (không ripple) — tương đương "Lift" trong Premiere.',
    inputSchema: {
      type: 'object',
      properties: {
        startSeconds: { type: 'number', description: 'Bắt đầu khoảng cần xoá (giây).' },
        endSeconds: { type: 'number', description: 'Kết thúc khoảng cần xoá (giây).' },
        trackType: { type: 'string', enum: ['video', 'audio', 'all'], description: 'Mặc định "all".' }
      },
      required: ['startSeconds', 'endSeconds']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('lift_selection', { startSeconds: args.startSeconds, endSeconds: args.endSeconds, trackType: args.trackType }, 20000);
    }
  },

  // ==========================================================================
  // GROUP 22 — Rename/Enable-Disable clip (2026-09-14)
  // ==========================================================================
  {
    name: 'rename_clip',
    description: 'Đổi tên clip TRÊN TIMELINE (track item, hiển thị trên clip label) — khác tên project item gốc trong Project panel, không ảnh hưởng các instance khác của cùng media.',
    inputSchema: {
      type: 'object',
      properties: {
        newName: { type: 'string', description: 'Tên mới cho clip trên timeline.' }
      },
      required: ['newName']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('rename_clip', { newName: args.newName }, 15000);
    }
  },

  {
    name: 'enable_disable_clip',
    description: 'Bật/tắt clip đang chọn trên timeline (Enable trong Premiere) — clip bị tắt vẫn còn trên timeline nhưng không hiển thị/phát, khác xoá hẳn.',
    inputSchema: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', description: 'true = bật (hiển thị bình thường), false = tắt (ẩn khỏi playback).' }
      },
      required: ['enabled']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('enable_disable_clip', { enabled: args.enabled }, 15000);
    }
  },

  // ==========================================================================
  // GROUP 23 — Effects nâng cao (2026-09-14)
  // ==========================================================================
  {
    name: 'get_effect_properties',
    description: 'Đọc TẤT CẢ parameter của 1 effect trên clip đang chọn: tên, giá trị hiện tại, số keyframe. Dùng get_clip_effects trước để lấy matchName.',
    inputSchema: {
      type: 'object',
      properties: {
        matchName: { type: 'string', description: 'FilterMatchName của effect trên clip (lấy từ get_clip_effects).' }
      },
      required: ['matchName']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('get_effect_properties', { matchName: args.matchName }, 15000);
    }
  },

  {
    name: 'remove_all_effects',
    description: 'Xoá TẤT CẢ effect người dùng đã thêm trên clip đang chọn trong 1 lệnh. Mặc định GIỮ LẠI Motion/Opacity (component nội tại mà UI Premiere bình thường không cho xoá — xoá sẽ làm clip mất khả năng đọc/ghi transform qua get_clip_transform/set_clip_position...). Trả về danh sách đã xoá/thất bại/bỏ qua riêng.',
    inputSchema: {
      type: 'object',
      properties: {
        includeIntrinsic: { type: 'boolean', description: 'true = xoá luôn cả Motion/Opacity (RỦI RO: clip mất khả năng đọc/ghi transform). Mặc định false.' }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('remove_all_effects', { includeIntrinsic: args.includeIntrinsic }, 20000);
    }
  },

  // ==========================================================================
  // GROUP 24 — Audio nâng cao cấp clip (2026-09-14)
  // ==========================================================================
  {
    name: 'get_clip_volume',
    description: 'Đọc gain (dB) và trạng thái mute hiện tại của clip audio đang chọn. Chỉ đọc.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    execute(wsBridge) {
      return wsBridge.sendCommand('get_clip_volume', {}, 15000);
    }
  },

  {
    name: 'set_clip_mute',
    description: 'Mute/unmute 1 clip audio riêng lẻ trên timeline (khác mute_track mute cả track).',
    inputSchema: {
      type: 'object',
      properties: {
        muted: { type: 'boolean', description: 'true = mute, false = unmute.' }
      },
      required: ['muted']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('set_clip_mute', { muted: args.muted }, 15000);
    }
  },

  // ==========================================================================
  // GROUP 25 — Playhead & Sequence In/Out (2026-09-14)
  // ==========================================================================
  {
    name: 'get_playhead_position',
    description: 'Đọc vị trí playhead (CTI) hiện tại trên sequence đang active, tính bằng giây.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    execute(wsBridge) {
      return wsBridge.sendCommand('get_playhead_position', {}, 15000);
    }
  },

  {
    name: 'set_playhead_position',
    description: 'Di chuyển playhead (CTI) trên sequence đang active tới thời điểm chỉ định.',
    inputSchema: {
      type: 'object',
      properties: {
        seconds: { type: 'number', description: 'Thời điểm cần di chuyển tới (giây).' }
      },
      required: ['seconds']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('set_playhead_position', { seconds: args.seconds }, 15000);
    }
  },

  {
    name: 'get_sequence_in_out_points',
    description: 'Đọc điểm in/out (work area) hiện tại của sequence đang active — khác in/out của 1 clip cụ thể.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    execute(wsBridge) {
      return wsBridge.sendCommand('get_sequence_in_out_points', {}, 15000);
    }
  },

  {
    name: 'set_sequence_in_out_points',
    description: 'Đặt điểm in/out (work area) của sequence đang active — dùng cho export theo work area, không phải in/out của 1 clip cụ thể.',
    inputSchema: {
      type: 'object',
      properties: {
        inSeconds: { type: 'number', description: 'Điểm in mới (giây). Bỏ trống nếu chỉ đổi out.' },
        outSeconds: { type: 'number', description: 'Điểm out mới (giây). Bỏ trống nếu chỉ đổi in.' }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('set_sequence_in_out_points', { inSeconds: args.inSeconds, outSeconds: args.outSeconds }, 15000);
    }
  },

  // ==========================================================================
  // GROUP 26 — Bin & Project Item nâng cao (2026-09-14)
  // ==========================================================================
  {
    name: 'rename_project_item',
    description: 'Đổi tên 1 item (clip/bin) trong Project panel theo tên hiện tại. Tìm kể cả trong bin con.',
    inputSchema: {
      type: 'object',
      properties: {
        itemName: { type: 'string', description: 'Tên hiện tại của item trong Project panel.' },
        newName: { type: 'string', description: 'Tên mới.' }
      },
      required: ['itemName', 'newName']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('rename_project_item', { itemName: args.itemName, newName: args.newName }, 15000);
    }
  },

  {
    name: 'delete_project_item',
    description: 'Xoá 1 item (clip/bin) khỏi Project panel theo tên. Tìm kể cả trong bin con. Không thể hoàn tác qua MCP.',
    inputSchema: {
      type: 'object',
      properties: {
        itemName: { type: 'string', description: 'Tên item cần xoá.' }
      },
      required: ['itemName']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('delete_project_item', { itemName: args.itemName }, 15000);
    }
  },

  {
    name: 'get_bin_contents',
    description: 'Liệt kê nội dung (tên + loại bin/clip) của 1 bin cụ thể trong Project panel.',
    inputSchema: {
      type: 'object',
      properties: {
        binName: { type: 'string', description: 'Tên bin cần đọc nội dung.' }
      },
      required: ['binName']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('get_bin_contents', { binName: args.binName }, 15000);
    }
  },

  {
    name: 'find_project_item_by_name',
    description: 'Tìm 1 item (clip/bin) trong Project panel theo tên, kể cả trong bin con. Trả về found:true/false.',
    inputSchema: {
      type: 'object',
      properties: {
        itemName: { type: 'string', description: 'Tên item cần tìm.' }
      },
      required: ['itemName']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('find_project_item_by_name', { itemName: args.itemName }, 15000);
    }
  },

  {
    name: 'get_project_item_info',
    description: 'Đọc thông tin chi tiết 1 item trong Project panel: tên, có phải bin không, color label, đường dẫn media (nếu là clip).',
    inputSchema: {
      type: 'object',
      properties: {
        itemName: { type: 'string', description: 'Tên item cần đọc.' }
      },
      required: ['itemName']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('get_project_item_info', { itemName: args.itemName }, 15000);
    }
  },

  // ==========================================================================
  // GROUP 27 — Selection nâng cao (2026-09-15)
  // ==========================================================================
  {
    name: 'invert_selection',
    description: 'Đảo ngược selection hiện tại trên timeline: clip đang chọn thì bỏ chọn, clip chưa chọn thì chọn.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    execute(wsBridge) {
      return wsBridge.sendCommand('invert_selection', {}, 15000);
    }
  },

  {
    name: 'set_clip_selection',
    description: 'Chọn hoặc bỏ chọn 1 clip cụ thể (theo vị trí + track) mà KHÔNG ảnh hưởng các clip đang chọn khác.',
    inputSchema: {
      type: 'object',
      properties: {
        startSeconds: { type: 'number', description: 'Bắt đầu khoảng chứa clip cần chọn/bỏ chọn (giây).' },
        endSeconds: { type: 'number', description: 'Kết thúc khoảng (giây).' },
        trackIndex: { type: 'number', description: 'Index track (0-based).' },
        trackType: { type: 'string', enum: ['video', 'audio'], description: 'Mặc định "video".' },
        selected: { type: 'boolean', description: 'true = chọn, false = bỏ chọn.' }
      },
      required: ['startSeconds', 'endSeconds', 'trackIndex', 'selected']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('set_clip_selection', {
        startSeconds: args.startSeconds, endSeconds: args.endSeconds,
        trackIndex: args.trackIndex, trackType: args.trackType, selected: args.selected
      }, 15000);
    }
  },

  // ==========================================================================
  // GROUP 28 — Sequence Zero Point (2026-09-15)
  // ==========================================================================
  {
    name: 'get_zero_point',
    description: 'Đọc timecode bắt đầu (zero point) của sequence đang active.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    execute(wsBridge) {
      return wsBridge.sendCommand('get_zero_point', {}, 15000);
    }
  },

  {
    name: 'set_zero_point',
    description: 'Đặt timecode bắt đầu (zero point) của sequence đang active.',
    inputSchema: {
      type: 'object',
      properties: {
        seconds: { type: 'number', description: 'Giá trị zero point mới (giây).' }
      },
      required: ['seconds']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('set_zero_point', { seconds: args.seconds }, 15000);
    }
  },

  // ==========================================================================
  // GROUP 29 — Proxy / Footage nâng cao (2026-09-15)
  // ==========================================================================
  {
    name: 'get_proxy_info',
    description: 'Đọc thông tin proxy của clip đang chọn: đã có proxy chưa, đường dẫn proxy nếu có.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    execute(wsBridge) {
      return wsBridge.sendCommand('get_proxy_info', {}, 15000);
    }
  },

  {
    name: 'attach_proxy',
    description: 'Gắn file proxy cho clip đang chọn.',
    inputSchema: {
      type: 'object',
      properties: {
        proxyFilePath: { type: 'string', description: 'Đường dẫn tuyệt đối file proxy.' }
      },
      required: ['proxyFilePath']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('attach_proxy', { proxyFilePath: args.proxyFilePath }, 20000);
    }
  },

  {
    name: 'refresh_media',
    description: 'Tải lại media từ đĩa cho clip đang chọn (sau khi file gốc bị thay đổi bên ngoài Premiere).',
    inputSchema: { type: 'object', properties: {}, required: [] },
    execute(wsBridge) {
      return wsBridge.sendCommand('refresh_media', {}, 20000);
    }
  },

  {
    name: 'set_offline',
    description: 'Đưa clip đang chọn vào trạng thái offline hoặc khôi phục online lại.',
    inputSchema: {
      type: 'object',
      properties: {
        offline: { type: 'boolean', description: 'true = đưa offline, false = khôi phục online.' }
      },
      required: ['offline']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('set_offline', { offline: args.offline }, 15000);
    }
  },

  {
    name: 'get_footage_interpretation',
    description: 'Đọc frame rate và pixel aspect ratio đang được diễn giải (interpret) cho clip đang chọn.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    execute(wsBridge) {
      return wsBridge.sendCommand('get_footage_interpretation', {}, 15000);
    }
  },

  {
    name: 'set_footage_interpretation',
    description: 'Đổi cách diễn giải (interpret) frame rate và/hoặc pixel aspect ratio của clip đang chọn — không đổi file gốc, chỉ đổi cách Premiere đọc nó.',
    inputSchema: {
      type: 'object',
      properties: {
        frameRate: { type: 'number', description: 'Frame rate mới để diễn giải (fps). Bỏ trống nếu chỉ đổi pixelAspectRatio.' },
        pixelAspectRatio: { type: 'number', description: 'Pixel aspect ratio mới. Bỏ trống nếu chỉ đổi frameRate.' }
      },
      required: []
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('set_footage_interpretation', { frameRate: args.frameRate, pixelAspectRatio: args.pixelAspectRatio }, 15000);
    }
  },

  {
    name: 'set_scale_to_frame_size',
    description: 'Bật/tắt "Scale to Frame Size" cho clip đang chọn (tự scale media vừa khung hình sequence).',
    inputSchema: {
      type: 'object',
      properties: {
        scaleToFrameSize: { type: 'boolean', description: 'true = bật, false = tắt.' }
      },
      required: ['scaleToFrameSize']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('set_scale_to_frame_size', { scaleToFrameSize: args.scaleToFrameSize }, 15000);
    }
  },

  {
    name: 'set_item_in_out',
    description: 'Đặt in/out điểm nguồn của 1 project item (khác in/out của clip trên timeline). CHƯA LIVE-TEST chữ ký tham số native.',
    inputSchema: {
      type: 'object',
      properties: {
        itemName: { type: 'string', description: 'Tên project item trong Project panel.' },
        inSeconds: { type: 'number', description: 'Điểm in mới (giây).' },
        outSeconds: { type: 'number', description: 'Điểm out mới (giây).' }
      },
      required: ['itemName', 'inSeconds', 'outSeconds']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('set_item_in_out', { itemName: args.itemName, inSeconds: args.inSeconds, outSeconds: args.outSeconds }, 15000);
    }
  },

  {
    name: 'clear_item_in_out',
    description: 'Xoá in/out điểm nguồn tuỳ chỉnh của 1 project item, về lại mặc định (dùng toàn bộ file). CHƯA LIVE-TEST chữ ký tham số native.',
    inputSchema: {
      type: 'object',
      properties: {
        itemName: { type: 'string', description: 'Tên project item trong Project panel.' }
      },
      required: ['itemName']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('clear_item_in_out', { itemName: args.itemName }, 15000);
    }
  },

  {
    name: 'create_subclip',
    description: 'Tạo subclip mới từ 1 project item với in/out chỉ định — subclip xuất hiện như 1 item riêng trong Project panel. CHƯA LIVE-TEST chữ ký tham số native.',
    inputSchema: {
      type: 'object',
      properties: {
        itemName: { type: 'string', description: 'Tên project item gốc.' },
        inSeconds: { type: 'number', description: 'Điểm in của subclip (giây).' },
        outSeconds: { type: 'number', description: 'Điểm out của subclip (giây).' },
        newName: { type: 'string', description: 'Tên subclip mới. Bỏ trống = tự đặt tên.' }
      },
      required: ['itemName', 'inSeconds', 'outSeconds']
    },
    execute(wsBridge, args) {
      return wsBridge.sendCommand('create_subclip', { itemName: args.itemName, inSeconds: args.inSeconds, outSeconds: args.outSeconds, newName: args.newName }, 20000);
    }
  }
];
